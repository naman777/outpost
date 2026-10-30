import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { applications, db } from "@/db";
import { StatusSelect } from "@/components/status-select";
import { Empty, PageHeader } from "@/components/ui";
import { ago, day } from "@/lib/format";
import { STATUSES } from "@/lib/statuses";
import { pageNumber } from "@/lib/validation";

const PAGE = 50;

export default async function Applications({ searchParams }: PageProps<"/applications">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageNumber(sp.page);
  const qs = (n: number) => `?${new URLSearchParams({ ...(status && { status }), ...(q && { q }), page: String(n) })}`;

  const where: (SQL | undefined)[] = [];
  if (status) where.push(eq(applications.status, status));
  if (q) where.push(or(ilike(applications.company, `%${q}%`), ilike(applications.contactEmail, `%${q}%`), ilike(applications.role, `%${q}%`), ilike(applications.notes, `%${q}%`)));

  const [rows, counts] = await Promise.all([
    db
      .select({
        // only what the table shows: notes and long fields stay in the database
        a: {
          id: applications.id,
          company: applications.company,
          role: applications.role,
          location: applications.location,
          track: applications.track,
          contactName: applications.contactName,
          contactEmail: applications.contactEmail,
          status: applications.status,
          followUpOn: applications.followUpOn,
        },
        emails: sql<number>`coalesce(s.emails, 0)`,
        lastSent: sql<string | null>`s.last_sent`,
        lastOpen: sql<string | null>`s.last_open`,
        opens: sql<number>`coalesce(s.opens, 0)`,
      })
      .from(applications)
      // one grouped pass over messages instead of four sub-queries per row
      .leftJoin(
        sql`(select application_id, count(*)::int as emails, max(sent_at) as last_sent,
               max(last_opened_at) as last_open, sum(open_count)::int as opens
             from messages where application_id is not null group by application_id) s`,
        sql`s.application_id = ${applications.id}`,
      )
      .where(and(...where))
      .orderBy(desc(applications.updatedAt))
      .limit(PAGE + 1)
      .offset((page - 1) * PAGE),
    db.select({ status: applications.status, n: sql<number>`count(*)::int` }).from(applications).groupBy(applications.status),
  ]);
  const more = rows.length > PAGE;
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const total = counts.reduce((n, c) => n + c.n, 0);

  return (
    <>
      <PageHeader title="Applications" sub="Every company you are reaching out to. Statuses move forward on their own as emails get opened and answered.">
        <Link href="/applications/new" className="btn">Add company</Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <Tab href="/applications" active={!status} label={`All ${total}`} />
        {STATUSES.map((s) => (
          <Tab key={s} href={`/applications?status=${s}`} active={status === s} label={`${s} ${count(s)}`} />
        ))}
      </div>
      <form className="mb-4 flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input aria-label="Search applications" name="q" defaultValue={q} placeholder="Search company, contact, role, notes" className="input min-w-0 max-w-sm" />
        <button className="btn-ghost">Search</button>
      </form>

      {rows.length === 0 ? (
        <Empty>
          Nothing here yet. Add companies by hand, or import your Excel tracker with <code>npm run import:tracker</code>.
        </Empty>
      ) : (
        <div className="records">
          <table role="table" aria-label="Applications" className="w-full">
            <thead role="rowgroup" className="border-b border-zinc-200">
              <tr role="row">
                <th role="columnheader" scope="col" className="th">Company</th>
                <th role="columnheader" scope="col" className="th">Contact</th>
                <th role="columnheader" scope="col" className="th">Status</th>
                <th role="columnheader" scope="col" className="th text-right">Emails</th>
                <th role="columnheader" scope="col" className="th">Last sent</th>
                <th role="columnheader" scope="col" className="th">Last opened</th>
                <th role="columnheader" scope="col" className="th">Follow up on</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-zinc-100">
              {rows.slice(0, PAGE).map(({ a, emails, lastSent, lastOpen, opens }) => (
                <tr role="row" key={a.id} className="hover:bg-zinc-50">
                  <td role="cell" className="td">
                    <Link href={`/applications/${a.id}`} className="font-medium hover:underline">{a.company}</Link>
                    <div className="max-w-56 truncate text-xs text-zinc-500">{[a.role, a.location, a.track].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td role="cell" data-label="Contact" className="td text-xs">
                    <div>{a.contactName ?? "—"}</div>
                    <div className="max-w-56 truncate text-zinc-500">{a.contactEmail}</div>
                  </td>
                  <td role="cell" data-label="Status" className="td"><StatusSelect id={a.id} status={a.status} /></td>
                  <td role="cell" data-label="Emails" className="td text-right tabular-nums">
                    {emails}
                    {opens > 0 && <div className="text-xs text-zinc-500">{opens} opens</div>}
                  </td>
                  <td role="cell" data-label="Last sent" className="td whitespace-nowrap text-xs text-zinc-600">{lastSent ? day(lastSent) : "—"}</td>
                  <td role="cell" data-label="Last opened" className="td whitespace-nowrap text-xs text-zinc-600">{lastOpen ? ago(lastOpen) : "—"}</td>
                  <td role="cell" data-label="Follow up on" className="td whitespace-nowrap text-xs text-zinc-600">{a.followUpOn ? day(a.followUpOn) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 1 || more) && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="btn-ghost">Previous</Link> : <span />}
          <span className="text-xs text-zinc-500">Page {page}</span>
          {more ? <Link href={qs(page + 1)} className="btn-ghost">Next</Link> : <span />}
        </div>
      )}
    </>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`filter-chip rounded-md px-3 py-1 text-xs capitalize ${active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"}`}
    >
      {label}
    </Link>
  );
}
