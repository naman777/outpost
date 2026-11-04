/** Import a portable JSON export. See docs/importing.md. Never sends email. */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { importInput } from "./import-format";
import { mailAddress } from "../src/lib/validation";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : process.argv[index + 1];
  return value?.startsWith("--") ? undefined : value;
};
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

async function main() {
  const file = arg("file");
  const sender = mailAddress.safeParse(arg("from"));
  if (!file || !sender.success) throw new Error("Usage: npm run import:tracker -- --file export.json --from you@example.com [--dry-run]");
  if (statSync(resolve(file)).size > 20 * 1024 * 1024) throw new Error("Import files must be at most 20 MiB.");
  const from = sender.data.toLowerCase();
  let contents: unknown;
  try { contents = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch { throw new Error("Could not read valid JSON from the import file."); }
  const input = importInput.safeParse(contents);
  if (!input.success) throw new Error(input.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
  const data = input.data;
  console.log(`Validated ${data.applications.length} applications and ${data.messages.length} messages.`);
  if (process.argv.includes("--dry-run")) {
    console.log("Dry run complete. No database connection or email sending.");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing, or use --dry-run.");
  const { db, applications, messages } = await import("../src/db");
  const appIds = new Map<string, string>();
  const messageIds = new Map<string, string>();
  let insertedApps = 0;
  let insertedMessages = 0;
  await db.transaction(async (tx) => {
    for (const { id, ...item } of data.applications) {
      const externalRef = `import:${hash(`${from}:application:${id}`)}`;
      const added = await tx.insert(applications).values({ ...item, externalRef })
        .onConflictDoNothing({ target: applications.externalRef }).returning({ id: applications.id });
      const row = added[0] ?? (await tx.select({ id: applications.id }).from(applications).where(eq(applications.externalRef, externalRef)))[0];
      appIds.set(id, row.id);
      insertedApps += added.length;
    }
    const newMessages = new Set<string>();
    for (const { id, applicationId, sentAt, ...item } of data.messages) {
      const trackingId = `import-${hash(`${from}:message:${id}`)}`;
      const added = await tx.insert(messages).values({
        ...item, followUpOf: null, trackingId, fromEmail: from, channel: "imported", tracked: false,
        trackClicks: false, sentAt: new Date(sentAt),
        applicationId: applicationId ? appIds.get(applicationId) : null,
        bouncedAt: item.status === "bounced" ? new Date(sentAt) : null,
      }).onConflictDoNothing({ target: messages.trackingId }).returning({ id: messages.id });
      const row = added[0] ?? (await tx.select({ id: messages.id }).from(messages).where(eq(messages.trackingId, trackingId)))[0];
      messageIds.set(id, row.id);
      if (added.length) newMessages.add(id);
      insertedMessages += added.length;
    }
    for (const item of data.messages) {
      if (item.followUpOf && newMessages.has(item.id)) {
        await tx.update(messages).set({ followUpOf: messageIds.get(item.followUpOf) }).where(eq(messages.id, messageIds.get(item.id)!));
      }
    }
  });
  console.log(`Imported ${insertedApps} applications and ${insertedMessages} messages. Existing records were skipped.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(process.env.DATABASE_URL && !process.argv.includes("--dry-run")
    ? "Import failed. Check the file format, database connection and schema. No partial transaction was saved."
    : (error as Error).message);
  process.exit(1);
});
