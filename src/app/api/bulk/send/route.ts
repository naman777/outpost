import { eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, db, messages } from "@/db";
import { headerText, recordId } from "@/lib/validation";
import { messageInput, parse } from "@/lib/api";
import { sameOriginRequest } from "@/lib/request-security";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { createTrackedMessage, deliver, MailboxLimitError } from "@/lib/send";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const input = messageInput.extend({
  requestId: recordId,
  accountId: recordId,
  attachments: z.array(z.object({
    filename: headerText.min(1), contentType: headerText.optional(),
    contentBase64: z.string().max(2800000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })).max(10).default([]),
});

export async function POST(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return Response.json({ error: "Sign in again before sending." }, { status: 401 });
  if (!sameOriginRequest(req)) return Response.json({ error: "invalid origin" }, { status: 403 });
  const parsed = await parse(req, input);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;
  if (data.attachments.reduce((n, a) => n + Buffer.byteLength(a.contentBase64, "base64"), 0) > 2 * 1024 * 1024) return Response.json({ error: "Attachments exceed 2 MiB." }, { status: 413 });
  const [existing] = await db.select({ id: messages.id, status: messages.status, accountId: messages.accountId, to: messages.toEmail }).from(messages).where(eq(messages.id, data.requestId));
  if (existing && (existing.accountId !== data.accountId || existing.to.toLowerCase() !== data.to.toLowerCase())) return Response.json({ error: "Request ID belongs to another message." }, { status: 409 });
  if (existing) return Response.json(existing.status === "sent" || existing.status === "bounced"
    ? { id: existing.id, status: "sent", duplicate: true }
    : { id: existing.id, error: "This recipient was already attempted. Review Sent mail; it will not be sent again automatically." },
  { status: existing.status === "sent" || existing.status === "bounced" ? 200 : 409 });
  const [account] = await db.select().from(accounts).where(eq(accounts.id, data.accountId));
  if (!account?.active) return Response.json({ error: "Choose an active connected mailbox." }, { status: 400 });
  let messageId: string | undefined;
  try {
    const created = await createTrackedMessage({ ...data, id: data.requestId, from: account.email, channel: account.kind, hasAttachment: data.attachments.length > 0 });
    messageId = created.message.id;
    await deliver(created.message, created.html, created.text, data.attachments);
    return Response.json({ id: messageId, status: "sent" }, { status: 201 });
  } catch (error) {
    if (error instanceof MailboxLimitError) return Response.json({ error: error.message }, { status: 429 });
    // A request can fail after a provider accepted it. Never retry an ambiguous send automatically.
    return Response.json({ id: messageId, error: "Send could not be confirmed. Review the message and your mailbox's Sent folder before sending again." }, { status: 502 });
  }
}
