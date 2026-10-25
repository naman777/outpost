import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { randomId } from "./crypto";
import { computeEngagement } from "./engagement";
import { trackingSummaryQuery, setOpenInclusion } from "./recount";
import { recordReply } from "./reply-events";

test("stored tracking evidence remains consistent through recounts, corrections and replies", async (t) => {
  const pg = new PGlite();
  const store = drizzle(pg, { schema });
  const shared = globalThis as unknown as { __db?: typeof store };
  const previous = shared.__db;
  shared.__db = store;
  const at = new Date("2026-01-01T10:00:00Z");
  try {
    for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await pg.exec(statement);
    const addMessage = async (patch: Partial<typeof schema.messages.$inferInsert> = {}) => (
      await store.insert(schema.messages).values({ trackingId: randomId(), channel: "api", toEmail: "alex@example.com", sentAt: at, ...patch }).returning()
    )[0];
    const rebuild = async (id: string) => {
      await store.execute(trackingSummaryQuery(id, 60));
      const [row] = await store.select().from(schema.messages).where(eq(schema.messages.id, id));
      assert.equal(row.engagementLevel, computeEngagement(row).level);
      return row;
    };
    await t.test("Apple-only loads stay uncertain and recounts do not manufacture opens", async () => {
      const m = await addMessage();
      await store.insert(schema.opens).values({ messageId: m.id, at, source: "apple", isHuman: false, confidence: "low" });
      const result = await rebuild(m.id);
      assert.equal(result.rawOpenCount, 1);
      assert.equal(result.openCount, 0);
      assert.equal(result.firstOpenedAt, null);
      assert.equal(result.openConfidence, "none");
      assert.equal(result.engagementLevel, "unknown");
    });
    await t.test("deduplication is scoped to a request context and repeat proxies add no certainty", async () => {
      const m = await addMessage();
      for (const seconds of [0, 30, 120]) await store.insert(schema.opens).values({
        messageId: m.id, at: new Date(at.getTime() + seconds * 1000), ip: "66.249.80.1", source: "gmail_proxy", isHuman: true, confidence: "medium",
      });
      let result = await rebuild(m.id);
      assert.equal(result.openCount, 2);
      assert.equal(result.rawOpenCount, 3);
      assert.equal(result.engagementLevel, "possible");
      assert.equal(result.openContextCount, 0);
      await store.insert(schema.opens).values({ messageId: m.id, at, ip: "203.0.113.2", source: "client", isHuman: true, confidence: "medium" });
      result = await rebuild(m.id);
      assert.equal(result.openCount, 3);
      assert.deepEqual(result.openSources, ["client", "gmail_proxy"]);
      assert.equal(result.engagementLevel, "likely");
      const stable = await rebuild(m.id);
      assert.equal(stable.openCount, result.openCount);
    });
    await t.test("correlated non-proxy contexts and source changes support likely activity", async () => {
      const m = await addMessage();
      await store.insert(schema.opens).values(["203.0.113.1", "203.0.113.2"].map((ip) => ({ messageId: m.id, at, ip, source: "client", isHuman: true, confidence: "medium" })));
      const result = await rebuild(m.id);
      assert.equal(result.openContextCount, 2);
      assert.equal(result.engagementLevel, "likely");
    });
    await t.test("a filtered click never upgrades Apple pixels or creates a first-open timestamp", async () => {
      const m = await addMessage({ trackClicks: true });
      await store.insert(schema.opens).values({ messageId: m.id, at, source: "apple", isHuman: false, confidence: "none" });
      await store.insert(schema.links).values({ id: "fixture-link", messageId: m.id, url: "https://example.com", position: 0 });
      await store.insert(schema.clicks).values({ messageId: m.id, linkId: "fixture-link", at, source: "client", confidence: "medium", isHuman: true });
      const result = await rebuild(m.id);
      assert.equal(result.clickCount, 1);
      assert.equal(result.openCount, 0);
      assert.equal(result.firstOpenedAt, null);
      assert.equal(result.engagementLevel, "likely");
      const [apple] = await store.select().from(schema.opens).where(eq(schema.opens.messageId, m.id));
      assert.equal(apple.confidence, "none");
    });
    await t.test("operator corrections update confidence, sources and engagement in both directions", async () => {
      const m = await addMessage();
      const [event] = await store.insert(schema.opens).values({ messageId: m.id, at, source: "apple", confidence: "none", isHuman: false }).returning();
      await setOpenInclusion(m.id, event.id, true);
      let result = await rebuild(m.id);
      assert.equal(result.openConfidence, "high");
      assert.equal(result.openCount, 1);
      assert.equal(result.engagementLevel, "possible");
      await setOpenInclusion(m.id, event.id, false);
      result = await rebuild(m.id);
      assert.equal(result.openConfidence, "none");
      assert.equal(result.openCount, 0);
      assert.deepEqual(result.openSources, []);
      const [eventAfter] = await store.select().from(schema.opens).where(eq(schema.opens.id, event.id));
      assert.equal(eventAfter.source, "apple", "Keep the original source for inspection");
    });
    await t.test("reply recording is idempotent and works with pixels off without inventing opens", async () => {
      const m = await addMessage({ tracked: false });
      const event = { at, from: "alex@example.com", snippet: "Fictional reply", key: "reply-fixture", kind: "reply" as const };
      assert.equal(await recordReply(m, event), true);
      assert.equal(await recordReply(m, event), false);
      const result = await rebuild(m.id);
      assert.equal(result.engagementLevel, "confirmed");
      assert.equal(result.openCount, 0);
      assert.equal(result.firstOpenedAt, null);
      assert.deepEqual(result.openSources, []);
    });
  } finally {
    if (previous === undefined) delete shared.__db; else shared.__db = previous;
    await pg.close();
  }
});
