import { eq, ilike, or, sql } from "drizzle-orm";
import { applications, db } from "@/db";

/** Finds the application a message belongs to: by id, by the contact's address, then by company name. */
export async function resolveApplication(opts: { applicationId?: string | null; to: string; company?: string | null }) {
  if (opts.applicationId) return opts.applicationId;
  const to = opts.to.trim().toLowerCase();
  const [byEmail] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(sql`${to} = any(regexp_split_to_array(lower(coalesce(${applications.contactEmail}, '')), ${"\\s*[;,]\\s*"}))`)
    .limit(1);
  if (byEmail) return byEmail.id;
  if (!opts.company?.trim()) return null;
  const [byCompany] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(or(ilike(applications.company, opts.company.trim()), eq(applications.externalRef, opts.company.trim())))
    .limit(1);
  return byCompany?.id ?? null;
}
