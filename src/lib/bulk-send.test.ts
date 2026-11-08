import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { reserveDelivery, MailboxLimitError } from "./send";

test("delivery reserves rolling mailbox capacity before sending, rejects replays and respects disabled mailboxes", async () => {
  const pg = new PGlite();
  const store = drizzle(pg, { schema });
  const shared = globalThis as unknown as { __db?: typeof store };
  const previous = shared.__db; shared.__db = store;
  try {
    for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await pg.exec(statement);
    const [account] = await store.insert(schema.accounts).values({ label: "Fixture", email: "sender@example.com", kind: "smtp", dailyLimit: 1 }).returning();
    const makeMessage = async (trackingId: string) => (await store.insert(schema.messages).values({ trackingId, accountId: account.id, channel: "smtp", toEmail: "alex@example.com", status: "draft" }).returning())[0];
    const first = await makeMessage("bulk-reservation-first");
    const second = await makeMessage("bulk-reservation-second");
    await reserveDelivery(first.id, account.id);
    await assert.rejects(reserveDelivery(first.id, account.id), /already been attempted/);
    await assert.rejects(reserveDelivery(second.id, account.id), MailboxLimitError);
    const [untouched] = await store.select().from(schema.messages).where(eq(schema.messages.id, second.id));
    assert.equal(untouched.sentAt, null);
    await store.update(schema.messages).set({ sentAt: new Date(Date.now() - 25 * 3600000) }).where(eq(schema.messages.id, first.id));
    await store.update(schema.accounts).set({ active: false }).where(eq(schema.accounts.id, account.id));
    await assert.rejects(reserveDelivery(second.id, account.id), /disabled/);
    await store.update(schema.accounts).set({ active: true }).where(eq(schema.accounts.id, account.id));
    await reserveDelivery(second.id, account.id);
    const [reserved] = await store.select().from(schema.messages).where(eq(schema.messages.id, second.id));
    assert.ok(reserved.sentAt);
  } finally {
    if (previous === undefined) delete shared.__db; else shared.__db = previous;
    await pg.close();
  }
});
