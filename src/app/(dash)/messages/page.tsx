import { and, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { applications, db, messages } from "@/db";
import { SyncButton } from "@/components/sync-button";
import { Empty, EngagementBadge, MessageState, PageHeader } from "@/components/ui";
import { ago, dateTime } from "@/lib/format";
import { pageNumber } from "@/lib/validation";

const FILTERS = {
  all: "All",
  opened: "Estimated opens",
  unopened: "No open detected",
  replied: "Replied",
  noreply: "No reply",
  bounced: "Bounced",
  failed: "Failed",
} as const;

const PAGE = 50;

export default async function Messages({ searchParams }: PageProps<"/messages">) {
  const sp = await searchParams;
  const filter = (typeof sp.f === "string" && sp.f in FILTERS ? sp.f : "all") as keyof typeof FILTERS;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const template = typeof sp.template === "string" ? sp.template : "";
  const page = pageNumber(sp.page);

  const where: (SQL | undefined)[] = [];
  if (filter === "opened") where.push(gt(messages.openCount, 0));
  if (filter === "unopened") where.push(and(eq(messages.openCount, 0), eq(messages.tracked, true), eq(messages.status, "sent")));
  if (filter === "replied") where.push(isNotNull(messages.repliedAt));
  if (filter === "noreply") where.push(and(isNull(messages.repliedAt), eq(messages.status, "sent")));
  if (filter === "bounced") where.push(eq(messages.status, "bounced"));
  if (filter === "failed") where.push(eq(messages.status, "failed"));
  if (template) where.push(eq(messages.template, template));
  if (q) where.push(or(ilike(messages.toEmail, `%${q}%`), ilike(messages.subject, `%${q}%`), ilike(applications.company, `%${q}%`)));

  const rows = await db
    // list columns only; bodies are loaded on the message page
    .select({
      m: {
        id: messages.id,
        toEmail: messages.toEmail,
        toName: messages.toName,
        subject: messages.subject,
        followUpOf: messages.followUpOf,
        template: messages.template,
        variant: messages.variant,
        sentAt: messages.sentAt,
        status: messages.status,
        openCount: messages.openCount,
        rawOpenCount: messages.rawOpenCount,
        rawClickCount: messages.rawClickCount,
        openSources: messages.openSources,
        openContextCount: messages.openContextCount,
        clickCount: messages.clickCount,
        repliedAt: messages.repliedAt,
        tracked: messages.tracked,
        lastOpenedAt: messages.lastOpenedAt,
      },
      company: applications.company,
    })
    .from(messages)
    .leftJoin(applications, eq(applications.id, messages.applicationId))
    .where(and(...where))
    .orderBy(desc(sql`coalesce(${messages.sentAt}, ${messages.createdAt})`))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const templates = await db.selectDistinct({ t: messages.template }).from(messages).where(isNotNull(messages.template));
  const more = rows.length > PAGE;
  const qs = (patch: Record<string, string | number>) =>
    "?" + new URLSearchParams({ f: filter, q, template, page: String(page), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) }).toString();

  return (
    <>
      <PageHeader title="Sent mail" sub="Every email the tracker knows about.">
        <Link href="/compose" className="btn">Compose</Link>
        <SyncButton />
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="f" value={filter} />
        <input aria-label="Search sent mail" name="q" defaultValue={q} placeholder="Search address, subject, company" className="input sm:max-w-xs" />
        <select aria-label="Template" name="template" defaultValue={template} className="input min-w-0 flex-1 sm:max-w-52">
          <option value="">All templates</option>
          {templates.map((t) => (
            <option key={t.t} value={t.t!}>{t.t}</option>
          ))}
        </select>
        <button className="btn-ghost">Filter</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link
            key={k}
            href={qs({ f: k, page: 1 })}
            className={`filter-chip rounded-md px-3 py-1 text-xs ${filter === k ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>
          No emails yet. <Link href="/compose" className="underline">Send or track one</Link>, or register mail from a script with the API.
        </Empty>
      ) : (
        <div className="records">
          <table role="table" aria-label="Sent mail" className="w-full">
            <thead role="rowgroup" className="border-b border-zinc-200">
              <tr role="row">
                <th role="columnheader" scope="col" className="th">To</th>
                <th role="columnheader" scope="col" className="th">Subject</th>
                <th role="columnheader" scope="col" className="th">Template</th>
                <th role="columnheader" scope="col" className="th">Sent</th>
                <th role="columnheader" scope="col" className="th">Status / engagement</th>
                <th role="columnheader" scope="col" className="th">Last estimated open</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-zinc-100">
              {rows.slice(0, PAGE).map(({ m, company }) => (
                <tr role="row" key={m.id} className="hover:bg-zinc-50">
                  <td role="cell" className="td">
                    <Link href={`/messages/${m.id}`} className="font-medium hover:underline">{company ?? m.toName ?? m.toEmail}</Link>
                    <div className="text-xs text-zinc-500">{m.toEmail}</div>
                  </td>
                  <td role="cell" data-label="Subject" className="td max-w-xs">
                    <div className="truncate">{m.subject}</div>
                    {m.followUpOf && <div className="text-xs text-zinc-500">follow-up</div>}
                  </td>
                  <td role="cell" data-label="Template" className="td text-xs text-zinc-600">{[m.template, m.variant].filter(Boolean).join(" · ") || "—"}</td>
                  <td role="cell" data-label="Sent" className="td whitespace-nowrap text-xs text-zinc-600">{dateTime(m.sentAt)}</td>
                  <td role="cell" data-label="Status" className="td"><div className="flex flex-wrap gap-1"><MessageState m={m} /><EngagementBadge m={m} /></div></td>
                  <td role="cell" data-label="Last estimated open" className="td whitespace-nowrap text-xs text-zinc-600">{m.lastOpenedAt ? ago(m.lastOpenedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link href={qs({ page: page - 1 })} className="btn-ghost">Newer</Link> : <span />}
        {more && <Link href={qs({ page: page + 1 })} className="btn-ghost">Older</Link>}
      </div>
    </>
  );
}
