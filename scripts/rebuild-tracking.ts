/** Review first; default is read-only. Apply only after db:push and a database backup. */
import { config } from "dotenv";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, messages, opens, clicks } from "../src/db";
import { classifyHit } from "../src/lib/tracking";
import { getSettings } from "../src/lib/settings";
import { refreshTrackingInTransaction } from "../src/lib/recount";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before rebuilding tracking.");
  const apply = process.argv.includes("--apply");
  const settings = await getSettings();
  let after: string | undefined;
  let count = 0;
  while (true) {
    const batch = await db.select({ id: messages.id }).from(messages)
      .where(after ? gt(messages.id, after) : undefined).orderBy(asc(messages.id)).limit(100);
    if (!batch.length) break;
    for (const item of batch) {
      if (apply) await db.transaction(async (tx) => {
        const [msg] = await tx.select({ id: messages.id, sentAt: messages.sentAt }).from(messages).where(eq(messages.id, item.id)).for("update");
        if (!msg) return;
        const events = await tx.select().from(opens).where(eq(opens.messageId, item.id)).orderBy(asc(opens.at), asc(opens.id));
        let firstApple: Date | null = null;
        for (const event of events) {
          // Preserve operator decisions and request-header exclusions that cannot be reconstructed.
          const manual = /marked as|manually included|manually excluded/i.test(event.reason ?? "");
          if (manual) {
            await tx.update(opens).set({ confidence: event.isHuman ? "high" : "none" }).where(eq(opens.id, event.id));
          } else if (!/HTML requested|explicitly marked as prefetch/i.test(event.reason ?? "")) {
            const result = classifyHit({ userAgent: event.userAgent ?? "", ip: event.ip, hasSelfCookie: event.source === "self",
              selfIps: settings.selfIps, graceSeconds: settings.graceSeconds,
              secondsSinceSend: msg.sentAt ? (event.at.getTime() - msg.sentAt.getTime()) / 1000 : null,
              secondsSinceFirstAppleHit: firstApple ? (event.at.getTime() - firstApple.getTime()) / 1000 : null,
            });
            if (result.source === "apple" && !firstApple) firstApple = event.at;
            await tx.update(opens).set(result).where(eq(opens.id, event.id));
          }
        }
        // Legacy link events have no browser-navigation evidence. Do not promote them to human clicks.
        await tx.update(clicks).set({ isHuman: false, confidence: "low", reason: "historical link request lacks navigation evidence" })
          .where(and(eq(clicks.messageId, item.id), eq(clicks.confidence, "none"), isNull(clicks.reason)));
        await refreshTrackingInTransaction(tx, item.id, settings.dedupeSeconds);
      });
      count++;
    }
    after = batch[batch.length - 1].id;
  }
  console.log(apply ? `Rebuilt ${count} message summaries; no emails sent.`
    : `Dry run: ${count} messages would be reviewed and rebuilt. No rows changed. Back up first, then pass --apply.`);
}
main().then(() => process.exit(0)).catch(() => {
  console.error("Tracking rebuild failed. Check DATABASE_URL, apply the schema with npm run db:push, and review docs/open-tracking.md. No secrets are printed.");
  process.exit(1);
});
