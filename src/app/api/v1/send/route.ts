import { eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, db } from "@/db";
import { apiAuthorized, messageInput, parse, unauthorized } from "@/lib/api";
import { resolveApplication } from "@/lib/apps";
import { createTrackedMessage, deliver } from "@/lib/send";
import { headerText } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sendInput = messageInput.extend({
  accountId: z.string().uuid().nullish(),
  attachments: z
    .array(z.object({ filename: headerText.min(1), contentBase64: z.string().max(2800000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), contentType: headerText.optional() }))
    .max(10)
    .default([]),
});

/** Send through a connected mailbox (Gmail API or SMTP). Pick it by accountId or by `from`. */
export async function POST(req: Request) {
  if (!apiAuthorized(req)) return unauthorized();
  const p = await parse(req, sendInput);
  if ("error" in p) return p.error;
  const d = p.data;
  if (d.attachments.reduce((sum, item) => sum + Buffer.byteLength(item.contentBase64, "base64"), 0) > 2 * 1024 * 1024) {
    return Response.json({ error: "Attachments exceed 2 MiB" }, { status: 413 });
  }
  const list = await db.select().from(accounts).where(eq(accounts.active, true));
  const account = d.accountId
    ? list.find((a) => a.id === d.accountId)
    : d.from
      ? list.find((a) => a.email.toLowerCase() === d.from!.toLowerCase())
      : list.length === 1
        ? list[0]
        : undefined;
  if (!account) {
    return Response.json({ error: "no matching account: pass accountId or the from address of a connected mailbox" }, { status: 400 });
  }

  const applicationId = await resolveApplication({ applicationId: d.applicationId, to: d.to, company: d.company });
  const { message, html, text } = await createTrackedMessage({
    ...d,
    from: account.email,
    accountId: account.id,
    applicationId,
    channel: account.kind,
    hasAttachment: d.attachments.length > 0,
  });
  try {
    await deliver(message, html, text, d.attachments);
  } catch (err) {
    return Response.json({ id: message.id, status: "failed", error: (err as Error).message }, { status: 502 });
  }
  return Response.json({ id: message.id, trackingId: message.trackingId, trackOpens: message.tracked, status: "sent",
    engagementLevel: message.engagementLevel, openConfidence: message.openConfidence, openSources: message.openSources,
  }, { status: 201 });
}
