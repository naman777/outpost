import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { accounts, db, links, messages, type Account, type Message } from "@/db";
import { decrypt, randomId } from "./crypto";
import { bumpStatus } from "./pipeline";
import { GmailClient } from "./providers/gmail";
import { smtpTransport } from "./providers/smtp";
import { htmlToText, injectPixel, rewriteLinks, textToHtml, wordCount } from "./tracking";

export type Attachment = { filename: string; contentBase64: string; contentType?: string };

export type NewMessage = {
  /** Optional request ID for idempotent bulk sends. */
  id?: string;
  to: string;
  toName?: string | null;
  subject: string;
  /** Give either text (converted to HTML) or html. With both, text is used as the plain part. */
  text?: string | null;
  html?: string | null;
  from?: string | null;
  accountId?: string | null;
  applicationId?: string | null;
  followUpOf?: string | null;
  template?: string | null;
  variant?: string | null;
  /** Disable only the open pixel; send history, replies and bounces still work. */
  trackOpens?: boolean;
  trackClicks?: boolean;
  channel: "gmail" | "smtp" | "api" | "manual";
  hasAttachment?: boolean;
  /** For api/manual mail that already went out. Defaults to now. */
  sentAt?: Date | null;
  messageIdHeader?: string | null;
};

const domainOf = (email: string | null | undefined) => email?.split("@")[1]?.toLowerCase() || "outpost.local";

/**
 * Stores the message and returns the HTML to send: the pixel is appended and,
 * if asked, links are rewritten to the click redirect. The plain-text part keeps the original links.
 */
export async function createTrackedMessage(input: NewMessage) {
  const trackingId = randomId();
  const baseHtml = input.html?.trim() ? input.html : textToHtml(input.text ?? "");
  const text = input.text?.trim() ? input.text : htmlToText(baseHtml);
  const rewritten = input.trackClicks ? rewriteLinks(baseHtml) : { html: baseHtml, links: [] };
  const tracked = input.trackOpens !== false;
  const html = injectPixel(rewritten.html, trackingId, tracked);
  const outbound = input.channel === "gmail" || input.channel === "smtp";

  const [msg] = await db
    .insert(messages)
    .values({
      id: input.id,
      trackingId,
      accountId: input.accountId ?? null,
      applicationId: input.applicationId ?? null,
      followUpOf: input.followUpOf ?? null,
      channel: input.channel,
      fromEmail: input.from?.toLowerCase() ?? null,
      toEmail: input.to.trim().toLowerCase(),
      toName: input.toName ?? null,
      subject: input.subject,
      bodyText: text,
      bodyHtml: baseHtml,
      template: input.template || null,
      variant: input.variant || null,
      tracked,
      engagementLevel: tracked ? "none" : "unknown",
      wordCount: wordCount(text),
      hasAttachment: input.hasAttachment ?? false,
      trackClicks: Boolean(input.trackClicks),
      status: outbound ? "draft" : "sent",
      sentAt: outbound ? null : (input.sentAt ?? new Date()),
      messageIdHeader: input.messageIdHeader ?? `<${trackingId}@${domainOf(input.from)}>`,
    })
    .returning();
  if (rewritten.links.length) {
    await db.insert(links).values(rewritten.links.map((l) => ({ ...l, messageId: msg.id })));
  }
  if (!outbound) await bumpStatus(msg.applicationId, "emailed");
  return { message: msg, html, text };
}

export async function sentToday(accountId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), gte(messages.sentAt, since), inArray(messages.status, ["draft", "sent", "bounced"])));
  return r.n;
}

export class MailboxLimitError extends Error {}

/** Reserve capacity before contacting the provider, including concurrent bulk/manual sends. */
export async function reserveDelivery(messageId: string, accountId: string) {
  await db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
    if (!account?.active) throw new Error("Mailbox is missing or disabled");
    const [message] = await tx.select().from(messages).where(eq(messages.id, messageId)).for("update");
    if (!message || message.accountId !== accountId || message.status !== "draft" || message.sentAt) throw new Error("This message has already been attempted. Check Sent mail before trying again.");
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(messages)
      .where(and(eq(messages.accountId, accountId), gte(messages.sentAt, new Date(Date.now() - 24 * 3600 * 1000)), inArray(messages.status, ["draft", "sent", "bounced"])));
    if (used.n >= account.dailyLimit) throw new MailboxLimitError(`Daily limit reached for ${account.email} (${used.n}/${account.dailyLimit} in the last 24 hours). Remaining recipients have not been sent.`);
    await tx.update(messages).set({ sentAt: new Date() }).where(eq(messages.id, messageId));
  });
}

/** Sends a stored draft through its account (Gmail API or SMTP) and records the provider ids. */
export async function deliver(msg: Message, html: string, text: string, attachments: Attachment[] = []) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, msg.accountId!));
  if (!account) throw new Error("Account not found");
  try { await reserveDelivery(msg.id, account.id); }
  catch (error) {
    if (error instanceof MailboxLimitError) {
      // No provider request happened; the same bulk row can be sent after capacity returns.
      await db.delete(messages).where(and(eq(messages.id, msg.id), eq(messages.status, "draft"), isNull(messages.sentAt)));
    }
    throw error;
  }

  const parent = msg.followUpOf ? (await db.select().from(messages).where(eq(messages.id, msg.followUpOf)))[0] : undefined;
  const mail = {
    from: account.fromName ? { name: account.fromName, address: account.email } : account.email,
    to: msg.toName ? { name: msg.toName, address: msg.toEmail } : msg.toEmail,
    subject: msg.subject,
    text,
    html,
    messageId: msg.messageIdHeader!,
    ...(parent?.messageIdHeader && { inReplyTo: parent.messageIdHeader, references: [parent.messageIdHeader] }),
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
    })),
  };

  try {
    const sentAt = new Date();
    if (account.kind === "gmail") {
      const gmail = new GmailClient(decrypt(account.gmailRefreshTokenEnc!));
      const raw = await new MailComposer(mail).compile().build();
      const r = await gmail.sendRaw(raw, parent?.providerThreadId);
      // Gmail may replace the Message-ID; store the real one so IMAP-side reply matching still works.
      const sent = await gmail.getMessage(r.id).catch(() => null);
      const realId = sent?.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value;
      await markSent(msg, account, sentAt, { providerMessageId: r.id, providerThreadId: r.threadId, messageIdHeader: realId || msg.messageIdHeader });
    } else {
      const info = await smtpTransport(account).sendMail(mail);
      await markSent(msg, account, sentAt, { providerMessageId: info.messageId, messageIdHeader: info.messageId || msg.messageIdHeader });
    }
  } catch (err) {
    await fail(msg, (err as Error).message);
    throw err;
  }
}

async function markSent(msg: Message, account: Account, sentAt: Date, ids: Partial<Message>) {
  await db
    .update(messages)
    .set({ ...ids, status: "sent", sentAt, fromEmail: account.email.toLowerCase(), error: null, hasAttachment: msg.hasAttachment })
    .where(eq(messages.id, msg.id));
  await bumpStatus(msg.applicationId, "emailed");
}

async function fail(msg: Message, error: string) {
  await db.update(messages).set({ status: "failed", error }).where(eq(messages.id, msg.id));
}
