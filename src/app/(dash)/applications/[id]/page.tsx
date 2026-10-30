import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteApplication, saveApplication } from "@/app/actions";
import { applications, db, messages } from "@/db";
import { Empty, MessageState, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { STATUSES } from "@/lib/statuses";
import { recordId } from "@/lib/validation";

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !recordId.safeParse(id).success) notFound();
  const a = isNew ? null : (await db.select().from(applications).where(eq(applications.id, id)))[0];
  if (!isNew && !a) notFound();
  const mail = a ? await db.select().from(messages).where(eq(messages.applicationId, a.id)).orderBy(desc(messages.sentAt)) : [];

  const field = (name: keyof NonNullable<typeof a>, label: string, opts: { type?: string; span?: boolean; placeholder?: string } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={opts.type ?? "text"} defaultValue={(a?.[name] as string | null) ?? ""} placeholder={opts.placeholder} className="input" />
    </div>
  );

  return (
    <>
      <PageHeader title={a?.company ?? "Add company"} sub={a ? `Added ${dateTime(a.createdAt)} · updated ${dateTime(a.updatedAt)}` : undefined}>
        {a && <Link href={`/compose?applicationId=${a.id}`} className="btn-ghost">Email them</Link>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <form action={saveApplication} className="card grid gap-4 p-5 sm:grid-cols-2 lg:col-span-2">
          {a && <input type="hidden" name="id" value={a.id} />}
          {field("company", "Company")}
          {field("role", "Role / angle")}
          {field("contactName", "Contact name")}
          {field("contactRole", "Contact role")}
          {field("contactEmail", "Contact email(s)", { span: true, placeholder: "a@x.com; b@x.com" })}
          {field("location", "Location")}
          {field("region", "Region", { placeholder: "India / Global" })}
          {field("track", "Track")}
          {field("priority", "Priority")}
          {field("link", "Careers / job link", { span: true })}
          {field("source", "Source")}
          {field("followUpOn", "Follow up on", { type: "date" })}
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={a?.status ?? "researching"} className="input">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={6} defaultValue={a?.notes ?? ""} className="input" />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn">{a ? "Save" : "Add"}</button>
            <Link href="/applications" className="btn-ghost">Back</Link>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Emails</h2>
            {mail.length === 0 ? (
              <Empty>No emails yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {mail.map((m) => (
                  <li key={m.id} className="text-sm">
                    <Link href={`/messages/${m.id}`} className="font-medium hover:underline">{m.subject}</Link>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      {m.toEmail} · {dateTime(m.sentAt)} <MessageState m={m} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {a && (
            <form action={deleteApplication}>
              <input type="hidden" name="id" value={a.id} />
              <button className="btn-danger">Delete company</button>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
