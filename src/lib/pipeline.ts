import { and, eq, inArray } from "drizzle-orm";
import { applications, db } from "@/db";
import { STATUSES, type Status } from "./statuses";

export { STATUSES };

const AUTO_ORDER: Status[] = ["researching", "emailed", "opened", "replied"];

/** Moves an application to `to` if it is still at an earlier automatic stage. */
export async function bumpStatus(applicationId: string | null | undefined, to: "emailed" | "opened" | "replied") {
  if (!applicationId) return;
  const earlier = AUTO_ORDER.slice(0, AUTO_ORDER.indexOf(to));
  await db
    .update(applications)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), inArray(applications.status, earlier)));
}
