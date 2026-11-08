import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMessage, markBounced, markReplied, toggleClick, toggleOpen } from "@/app/actions";
import { accounts, applications, clicks, db, links, messages, opens, replies } from "@/db";
import { Badge, EngagementBadge, MessageState, PageHeader, STATUS_TONE, Stat, TextLink } from "@/components/ui";
import { dateTime, duration, SOURCE_LABEL } from "@/lib/format";
import { computeEngagement, OPEN_ACCURACY_NOTE } from "@/lib/engagement";
import { messageOpenSources } from "@/lib/stats";
import { recordId } from "@/lib/validation";

export default async function MessagePage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!recordId.safeParse(id).success) notFound();
  const [m] = await db.select().from(messages).where(eq(messages.id, id));
  if (!m) notFound();

  const [openRows, clickRows, linkRows, replyRows, app, account, followUps, parent, sourceRows] = await Promise.all([
    db.select().from(opens).where(eq(opens.messageId, id)).orderBy(asc(opens.at)),
    db.select().from(clicks).where(eq(clicks.messageId, id)).orderBy(asc(clicks.at)),
    db.select().from(links).where(eq(links.messageId, id)).orderBy(asc(links.position)),
    db.select().from(replies).where(eq(replies.messageId, id)).orderBy(asc(replies.at)),
    m.applicationId ? db.select().from(applications).where(eq(applications.id, m.applicationId)).then((r) => r[0]) : null,
    m.accountId ? db.select().from(accounts).where(eq(accounts.id, m.accountId)).then((r) => r[0]) : null,
    db.select().from(messages).where(eq(messages.followUpOf, id)),
    m.followUpOf ? db.select().from(messages).where(eq(messages.id, m.followUpOf)).then((r) => r[0]) : null,
    messageOpenSources(id),
  ]);
  const engagement = computeEngagement(m);
  const linkUrl = new Map(linkRows.map((l) => [l.id, l.url]));

  type Ev = { at: Date; kind: string; title: string; detail?: string | null; human: boolean; eligible?: boolean; confidence?: string; openId?: number; clickId?: number; exclusion?: string };
  const events: Ev[] = [
    ...(m.sentAt ? [{ at: m.sentAt, kind: "sent", title: `Sent via ${m.channel}`, detail: m.fromEmail, human: true }] : []),
    ...openRows.map((o) => ({
      at: o.at,
      kind: "open",
      title: `${o.isHuman ? "Estimated open" : "Image load"} · ${SOURCE_LABEL[o.source] ?? o.source}`,
      detail: [o.reason, o.ip, o.userAgent?.slice(0, 120)].filter(Boolean).join(" · "),
      human: o.counted,
      eligible: o.isHuman,
      confidence: o.confidence,
      openId: o.id,
    })),
    ...clickRows.map((c) => ({
      at: c.at, kind: "click", title: c.isHuman ? "Likely link click" : "Link request",
      detail: [linkUrl.get(c.linkId), c.reason].filter(Boolean).join(" · "),
      human: c.counted, eligible: c.isHuman, confidence: c.confidence, clickId: c.id,
      exclusion: c.isHuman ? "deduplicated" : c.reason?.includes("operator IP") ? "excluded: dashboard IP match" : "excluded",
    })),
    ...replyRows.map((r) => ({ at: r.at, kind: r.kind, title: r.kind === "bounce" ? "Bounced" : `Reply from ${r.fromEmail ?? "recipient"}`, detail: r.snippet, human: true })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const sinceSend = (d: Date | null) => (d && m.sentAt ? duration((d.getTime() - m.sentAt.getTime()) / 60000) : "—");

  return (
    <>
      <PageHeader
        title={m.subject || "(no subject)"}
        sub={
          <>
            To {m.toName ? `${m.toName} <${m.toEmail}>` : m.toEmail}
            {m.fromEmail && <> · from {m.fromEmail}</>}
            {account && <> ({account.label})</>}
          </>
        }
      >
        <MessageState m={m} />
        <Link href={`/compose?followUpOf=${m.id}`} className="btn">Follow up</Link>
      </PageHeader>

      {m.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{m.error}</div>}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        <Stat label="Sent" value={<span className="text-base">{dateTime(m.sentAt)}</span>} />
        <Stat label="Estimated opens" value={m.tracked ? m.openCount : "off"} hint={m.tracked ? `${m.rawOpenCount} pixel hits in total` : "Open tracking disabled"} />
        <Stat label="First estimated open" value={<span className="text-base">{m.tracked ? sinceSend(m.firstOpenedAt) : "off"}</span>} hint={m.tracked ? "after sending" : undefined} />
        <Stat label="Clicks" value={m.trackClicks ? m.clickCount : "off"} />
        <Stat label="Reply" value={<span className="text-base">{m.repliedAt ? sinceSend(m.repliedAt) : "—"}</span>} hint={m.repliedAt ? "after sending" : undefined} />
      </div>

      <section className="card mt-6 p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Engagement evidence</h2><EngagementBadge m={m} /></div>
        <p className="mt-2 text-sm text-zinc-600">{engagement.signals.join(" ")}</p>
        <p className="mt-2 text-xs text-zinc-500">{OPEN_ACCURACY_NOTE}</p>
        <p className="mt-2 text-xs text-zinc-500">Best included pixel confidence: {m.openConfidence}. Confidence is a rule-based category, not a measured probability.</p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          {clickRows.some((c) => !c.isHuman && c.reason?.includes("operator IP")) && (
            <p className="mb-3 text-xs text-zinc-500">An IP match can exclude real clicks from someone on your Wi-Fi or office network. Use “Include this click” only when you recognize the activity. Repeated clicks within the deduplication window still count once.</p>
          )}
          {!m.tracked && <p className="mb-3 text-xs text-zinc-500">No open-tracking pixel. Replies and bounces are still tracked.</p>}
          <ol className="relative space-y-3 border-l border-zinc-200 pl-4">
            {events.map((e, i) => (
              <li key={i} className={e.human ? "" : "opacity-60"}>
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${dot(e.kind, e.human)}`} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{e.title}</span>
                  {!e.human && <Badge>{e.exclusion ?? "not counted / deduplicated"}</Badge>}
                  {e.confidence && <Badge>{e.confidence} confidence</Badge>}
                  <span className="text-xs text-zinc-500">{dateTime(e.at)}</span>
                  {e.openId && (
                    <form action={toggleOpen}>
                      <input type="hidden" name="openId" value={e.openId} />
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="human" value={String(!e.eligible)} />
                      <button className="text-xs text-zinc-500 underline hover:text-zinc-900">
                        {e.eligible ? "exclude this estimate" : "include as estimate"}
                      </button>
                    </form>
                  )}
                  {e.clickId && m.trackClicks && (
                    <form action={toggleClick}>
                      <input type="hidden" name="clickId" value={e.clickId} />
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="human" value={String(!e.eligible)} />
                      <button className="text-xs text-zinc-500 underline hover:text-zinc-900">
                        {e.eligible ? "Exclude this click" : "Include this click"}
                      </button>
                    </form>
                  )}
                </div>
                {e.detail && <div className="mt-0.5 break-all text-xs text-zinc-500">{e.detail}</div>}
              </li>
            ))}
          </ol>
          {linkRows.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold">Links</h3>
              <ul className="space-y-1 text-sm">
                {linkRows.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="min-w-0">{l.url}</span>
                    <span className="shrink-0 tabular-nums text-zinc-600">{l.clickCount} clicks</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Image-load sources</h2>
            {!sourceRows.length ? <p className="text-xs text-zinc-500">No image loads recorded.</p> : sourceRows.map((row) => (
              <div key={`${row.source}-${row.confidence}`} className="border-t border-zinc-100 pt-2">
                <div>{SOURCE_LABEL[row.source] ?? row.source} · {row.confidence} confidence</div>
                <p className="text-xs text-zinc-500">{row.raw} loads · {row.included} included after deduplication</p>
              </div>
            ))}
          </section>
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold">Details</h2>
            {app ? (
              <div>
                Application: <TextLink href={`/applications/${app.id}`}>{app.company}</TextLink>{" "}
                <Badge tone={STATUS_TONE[app.status] ?? "zinc"}>{app.status}</Badge>
              </div>
            ) : (
              <div className="text-zinc-500">Not linked to an application</div>
            )}
            <div>Template: {[m.template, m.variant].filter(Boolean).join(" · ") || "—"}</div>
            <div>Length: {m.wordCount ?? "—"} words{m.hasAttachment && " · attachment"}</div>
            {parent && <div>Follow-up of <TextLink href={`/messages/${parent.id}`}>{parent.subject}</TextLink></div>}
            {followUps.map((f) => (
              <div key={f.id}>Followed up: <TextLink href={`/messages/${f.id}`}>{dateTime(f.sentAt)}</TextLink></div>
            ))}
            <div className="break-all text-xs text-zinc-400">Message-ID {m.messageIdHeader}</div>
          </section>
          <section className="card flex flex-wrap gap-2 p-4">
            {!m.repliedAt && (
              <form action={markReplied}>
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-ghost">Mark replied</button>
              </form>
            )}
            {m.status !== "bounced" && (
              <form action={markBounced}>
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-ghost">Mark bounced</button>
              </form>
            )}
            <form action={deleteMessage}>
              <input type="hidden" name="id" value={m.id} />
              <button className="btn-danger">Delete</button>
            </form>
          </section>
        </aside>
      </div>

      {(m.bodyHtml || m.bodyText) && (
        <section className="card mt-6 p-4">
          <h2 className="mb-3 text-sm font-semibold">Email</h2>
          {m.bodyHtml ? (
            <iframe sandbox="" srcDoc={m.bodyHtml} className="h-96 w-full rounded border border-zinc-100" title="Email body" />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">{m.bodyText}</pre>
          )}
        </section>
      )}
    </>
  );
}

function dot(kind: string, human: boolean) {
  if (!human) return "bg-zinc-300";
  return { sent: "bg-zinc-800", open: "bg-sky-500", click: "bg-violet-500", reply: "bg-emerald-500", bounce: "bg-red-500" }[kind] ?? "bg-zinc-400";
}
