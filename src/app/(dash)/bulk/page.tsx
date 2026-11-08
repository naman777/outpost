import { asc, eq } from "drizzle-orm";
import { accounts, db } from "@/db";
import { BulkMailForm } from "@/components/bulk-mail-form";
import { PageHeader } from "@/components/ui";
import { sentToday } from "@/lib/send";

export default async function BulkMailPage() {
  const mailboxes = await db.select().from(accounts).where(eq(accounts.active, true)).orderBy(asc(accounts.createdAt));
  const options = await Promise.all(mailboxes.map(async (account) => ({ id: account.id, email: account.email, label: account.label,
    dailyLimit: account.dailyLimit, remaining: Math.max(0, account.dailyLimit - await sentToday(account.id)) })));
  return <><PageHeader title="Bulk mail" sub="Import recipients, personalize a template, and review each email before sending." /><BulkMailForm accounts={options} /></>;
}
