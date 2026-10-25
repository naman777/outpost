import { eq } from "drizzle-orm";
import { db, messages, replies, type Message } from "@/db";
import { getSettings } from "./settings";
import { refreshTrackingInTransaction } from "./recount";
import { bumpStatus } from "./pipeline";

export type ReplyEvent = { at: Date; from: string | null; snippet: string; key: string; kind: "reply" | "bounce" };

/** Used by mailbox sync and manual corrections. Reply evidence never manufactures pixel opens. */
export async function recordReply(msg: Pick<Message, "id" | "applicationId">, event: ReplyEvent) {
  const settings = await getSettings();
  const recorded = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(messages).where(eq(messages.id, msg.id)).for("update");
    if (!current) return false;
    const inserted = await tx.insert(replies).values({
      messageId: msg.id, at: event.at, fromEmail: event.from, snippet: event.snippet.slice(0, 500), providerKey: event.key, kind: event.kind,
    }).onConflictDoNothing().returning({ id: replies.id });
    if (!inserted.length) return false;
    if (event.kind === "bounce") {
      await tx.update(messages).set({ status: "bounced", bouncedAt: event.at }).where(eq(messages.id, msg.id));
    } else {
      await tx.update(messages).set({ repliedAt: event.at, replySnippet: event.snippet.slice(0, 500) }).where(eq(messages.id, msg.id));
    }
    await refreshTrackingInTransaction(tx, msg.id, settings.dedupeSeconds);
    return true;
  });
  if (recorded && event.kind === "reply") await bumpStatus(msg.applicationId, "replied");
  return recorded;
}
