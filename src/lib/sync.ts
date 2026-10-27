import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { accounts, db, messages, type Account, type Message } from "@/db";
import { decrypt } from "./crypto";
import { recordReply } from "./reply-events";
import { bodyText, GmailClient, header } from "./providers/gmail";
import { imapClient } from "./providers/smtp";

const LOOKBACK_DAYS = 45;
const BOUNCE_WINDOW_MS = 3 * 864e5;
/** Re-scan this much before the last successful check, so slow-arriving mail is not skipped. */
const RESCAN_OVERLAP_MS = 2 * 864e5;
const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;

/** Webmail domains: a reply from the same one of these is not "the same company". */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "zoho.com"]);
const domain = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const normSubject = (s: string | null | undefined) =>
  (s ?? "").replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const bareId = (id: string | null) => id?.replace(/[<>]/g, "").trim() ?? "";

/** Sent mail from this mailbox still waiting for an answer: sent by the app, by a script (API) or imported. */
async function pendingFor(account: Account): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(
        or(eq(messages.accountId, account.id), and(isNull(messages.accountId), eq(messages.fromEmail, account.email.toLowerCase()))),
        eq(messages.status, "sent"),
        isNull(messages.repliedAt),
        gte(messages.sentAt, new Date(Date.now() - LOOKBACK_DAYS * 864e5)),
      ),
    );
}

/** True if the bounce report mentions this message (its Message-ID or pixel id). */
const bounceMatches = (text: string, m: Message) =>
  (bareId(m.messageIdHeader) && text.includes(bareId(m.messageIdHeader))) || text.includes(m.trackingId);

/** Latest message sent before `at` among `list`. */
const latestBefore = (list: Message[] | undefined, at: Date) =>
  list?.filter((m) => m.sentAt! < at && !m.repliedAt).sort((a, b) => b.sentAt!.getTime() - a.sentAt!.getTime())[0];

async function syncGmail(account: Account, pending: Message[]) {
  const gmail = new GmailClient(decrypt(account.gmailRefreshTokenEnc!));
  let found = 0;
  const me = account.email.toLowerCase();

  for (const m of pending) {
    const since = m.sentAt!.getTime();
    let candidates: { id: string; internalDate: string; from: string; snippet: string }[] = [];
    if (m.providerThreadId) {
      const t = await gmail.getThread(m.providerThreadId);
      candidates = t.messages.map((x) => ({ id: x.id, internalDate: x.internalDate, from: header(x, "From"), snippet: x.snippet ?? "" }));
    } else {
      // Sent outside the app (script, copy/paste): any mail from the recipient after sending is the reply.
      const ids = await gmail.search(`from:${m.toEmail} after:${Math.floor(since / 1000)}`, 5);
      for (const id of ids) {
        const x = await gmail.getMessage(id);
        candidates.push({ id: x.id, internalDate: x.internalDate, from: header(x, "From"), snippet: x.snippet ?? "" });
      }
    }
    const hit = candidates
      .filter((c) => Number(c.internalDate) > since && addr(c.from) !== me)
      .sort((a, b) => Number(a.internalDate) - Number(b.internalDate))[0];
    if (hit) {
      const kind = BOUNCE_FROM.test(hit.from) ? "bounce" : "reply";
      if (await recordReply(m, { at: new Date(Number(hit.internalDate)), from: addr(hit.from), snippet: hit.snippet, key: `gmail:${hit.id}`, kind }))
        found++;
    }
  }

  // Bounces usually arrive in a new thread; match them by the Message-ID quoted in the report.
  const open = pending.filter((m) => !m.repliedAt);
  if (open.length) {
    for (const id of await gmail.search(`from:(mailer-daemon OR postmaster) newer_than:${LOOKBACK_DAYS}d`, 100)) {
      const full = await gmail.getMessage(id, "full");
      const text = bodyText(full.payload);
      const m = open.find((x) => bounceMatches(text, x));
      if (m && (await recordReply(m, { at: new Date(Number(full.internalDate)), from: addr(header(full, "From")), snippet: full.snippet ?? "", key: `gmail:${id}`, kind: "bounce" })))
        found++;
    }
  }
  return found;
}

async function syncImap(account: Account, pending: Message[]) {
  const client = imapClient(account);
  await client.connect();
  let found = 0;
  try {
    // Gmail keeps archived replies out of INBOX, so prefer the "All Mail" folder when the server has one.
    const boxes = await client.list();
    const all = boxes.find((b) => b.specialUse === "\\All")?.path;
    const lock = await client.getMailboxLock(all ?? "INBOX");
    try {
      // First check scans back to the oldest unanswered mail; later checks only what arrived since the last one.
      const oldestPending = Math.min(...pending.map((m) => m.sentAt!.getTime()));
      const lastOk = account.lastSyncedAt && !account.lastSyncError ? account.lastSyncedAt.getTime() - RESCAN_OVERLAP_MS : 0;
      const oldest = new Date(Math.max(oldestPending, lastOk));
      const me = account.email.toLowerCase();
      // skip our own sent copies: they are most of "All Mail" and can't be replies
      const uids = (await client.search({ since: oldest, not: { from: me } }, { uid: true })) || [];
      if (!uids.length) return 0;
      const byId = new Map(pending.filter((m) => m.messageIdHeader).map((m) => [bareId(m.messageIdHeader), m]));
      const byAddr = new Map<string, Message[]>();
      const byDomain = new Map<string, Message[]>();
      for (const m of pending) {
        byAddr.set(m.toEmail, [...(byAddr.get(m.toEmail) ?? []), m]);
        const d = domain(m.toEmail);
        if (!FREE_MAIL.has(d)) byDomain.set(d, [...(byDomain.get(d) ?? []), m]);
      }
      const bounces: number[] = [];

      for await (const msg of client.fetch(uids, { envelope: true, headers: ["in-reply-to", "references"], uid: true }, { uid: true })) {
        const env = msg.envelope;
        if (!env) continue;
        const from = env.from?.[0]?.address?.toLowerCase() ?? "";
        const at = env.date ? new Date(env.date) : new Date();
        if (!from || from === me) continue;
        if (BOUNCE_FROM.test(from) || BOUNCE_FROM.test(env.from?.[0]?.name ?? "")) {
          bounces.push(msg.uid);
          continue;
        }
        const refs = (msg.headers?.toString() ?? "").match(/<[^>]+>/g)?.map(bareId) ?? [];
        // 1. threaded on our Message-ID, 2. from the person we wrote to,
        // 3. a colleague at the same company answering on the same subject (hiring@, a co-founder, ...)
        const subject = normSubject(env.subject);
        const target =
          refs.map((r) => byId.get(r)).find(Boolean) ??
          latestBefore(byAddr.get(from), at) ??
          (subject ? latestBefore(byDomain.get(domain(from))?.filter((m) => { const ms = normSubject(m.subject); return Boolean(ms) && subject.includes(ms); }), at) : undefined);
        if (target && !target.repliedAt) {
          const key = `imap:${env.messageId ?? `${account.id}:${msg.uid}`}`;
          if (await recordReply(target, { at, from, snippet: env.subject ?? "", key, kind: "reply" })) {
            target.repliedAt = at;
            found++;
          }
        }
      }

      for (const uid of bounces) {
        const m = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!m || !m.source) continue;
        const text = m.source.toString("utf8");
        const lower = text.toLowerCase();
        const at = m.envelope?.date ? new Date(m.envelope.date) : new Date();
        // match on our ids first; imported mail has none, so fall back to the failed address quoted in the report
        const target =
          pending.find((x) => !x.repliedAt && x.status === "sent" && bounceMatches(text, x)) ??
          latestBefore(
            // reports come back within minutes; an older mail to the same address is a different send
            pending.filter((x) => x.status === "sent" && lower.includes(x.toEmail) && at.getTime() - x.sentAt!.getTime() < BOUNCE_WINDOW_MS),
            at,
          );
        if (target) {
          const key = `imap:${m.envelope?.messageId ?? `${account.id}:${uid}`}`;
          target.status = "bounced";
          if (await recordReply(target, { at, from: "mailer-daemon", snippet: m.envelope?.subject ?? "Delivery failed", key, kind: "bounce" }))
            found++;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return found;
}

export async function syncAccount(account: Account): Promise<{ found: number; error?: string }> {
  try {
    const pending = await pendingFor(account);
    let found = 0;
    if (pending.length) {
      if (account.kind === "gmail") found = await syncGmail(account, pending);
      else if (account.imapHost) found = await syncImap(account, pending);
    }
    await db.update(accounts).set({ lastSyncedAt: new Date(), lastSyncError: null }).where(eq(accounts.id, account.id));
    return { found };
  } catch (err) {
    const error = (err as Error).message;
    await db.update(accounts).set({ lastSyncedAt: new Date(), lastSyncError: error }).where(eq(accounts.id, account.id));
    return { found: 0, error };
  }
}

export async function syncAll(ids?: string[]) {
  const list = await db
    .select()
    .from(accounts)
    .where(ids?.length ? and(eq(accounts.active, true), inArray(accounts.id, ids)) : eq(accounts.active, true));
  const results = [];
  for (const a of list) results.push({ account: a.email, ...(await syncAccount(a)) });
  return results;
}
