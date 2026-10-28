import { asc, eq } from "drizzle-orm";
import { accounts, applications, db, messages } from "@/db";
import { ComposeForm } from "@/components/compose-form";
import { PageHeader } from "@/components/ui";
import { recordId } from "@/lib/validation";

export default async function Compose({ searchParams }: PageProps<"/compose">) {
  const sp = await searchParams;
  const applicationId = recordId.safeParse(sp.applicationId).success ? sp.applicationId as string : "";
  const followUpOf = recordId.safeParse(sp.followUpOf).success ? sp.followUpOf as string : null;
  const [accs, apps, parentRow] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)).orderBy(asc(accounts.createdAt)),
    db
      .select({ id: applications.id, company: applications.company, contactEmail: applications.contactEmail, contactName: applications.contactName })
      .from(applications)
      .orderBy(asc(applications.company)),
    followUpOf ? db.select().from(messages).where(eq(messages.id, followUpOf)).then((r) => r[0]) : null,
  ]);
  const parent = parentRow
    ? { id: parentRow.id, to: parentRow.toEmail, toName: parentRow.toName, subject: parentRow.subject, template: parentRow.template, applicationId: parentRow.applicationId }
    : null;
  // Follow-ups go out from the mailbox the first email used, so they land in the same thread.
  const defaultVia = (parentRow?.accountId && accs.find((a) => a.id === parentRow.accountId)?.id) || accs[0]?.id || "manual";

  return (
    <>
      <PageHeader
        title={parent ? "Follow up" : "Compose"}
        sub={parent ? `Replying in the thread with ${parent.to}.` : "Send through a connected mailbox, or create a tracked email to send from anywhere."}
      />
      <ComposeForm
        accounts={accs.map((a) => ({ id: a.id, label: a.label, email: a.email, kind: a.kind }))}
        apps={apps}
        parent={parent}
        defaultVia={defaultVia}
        initialAppId={applicationId}
      />
    </>
  );
}
