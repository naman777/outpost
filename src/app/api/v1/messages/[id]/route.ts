import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, messages } from "@/db";
import { apiAuthorized, readJsonBody, unauthorized } from "@/lib/api";
import { headerText, recordId } from "@/lib/validation";

export const dynamic = "force-dynamic";

const patch = z.object({
  status: z.enum(["sent", "failed", "bounced"]).optional(),
  error: z.string().max(2000).nullish(),
  sentAt: z.coerce.date().optional(),
  messageId: headerText.optional(),
  providerMessageId: headerText.optional(),
});

/** Tell the tracker what happened after you sent: the send failed, or the real Message-ID. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!apiAuthorized(req)) return unauthorized();
  const { id } = await ctx.params;
  if (!recordId.safeParse(id).success) return Response.json({ error: "invalid message ID" }, { status: 400 });
  const input = await readJsonBody(req);
  if ("error" in input) return input.error;
  const r = patch.safeParse(input.body);
  if (!r.success) return Response.json({ error: "invalid body", issues: r.error.issues }, { status: 400 });
  const { messageId, ...rest } = r.data;
  const [row] = await db
    .update(messages)
    .set({ ...rest, ...(messageId && { messageIdHeader: messageId }) })
    .where(eq(messages.id, id))
    .returning({ id: messages.id, status: messages.status });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
