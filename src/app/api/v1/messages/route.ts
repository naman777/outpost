import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, messages } from "@/db";
import { apiAuthorized, messageInput, parse, unauthorized } from "@/lib/api";
import { resolveApplication } from "@/lib/apps";
import { createTrackedMessage } from "@/lib/send";
import { pixelHtml, pixelUrl } from "@/lib/tracking";
import { headerText } from "@/lib/validation";
import { computeEngagement } from "@/lib/engagement";

export const dynamic = "force-dynamic";

const registerInput = messageInput.extend({
  sentAt: z.coerce.date().nullish(),
  /** the Message-ID header you will send with (lets IMAP sync match replies exactly) */
  messageId: headerText.nullish(),
});

/**
 * Register mail you send yourself (any client, any script). Returns the HTML with the pixel
 * (and rewritten links if trackClicks): send that as the HTML part.
 */
export async function POST(req: Request) {
  if (!apiAuthorized(req)) return unauthorized();
  const p = await parse(req, registerInput);
  if ("error" in p) return p.error;
  const d = p.data;
  const applicationId = await resolveApplication({ applicationId: d.applicationId, to: d.to, company: d.company });
  const { message, html, text } = await createTrackedMessage({
    ...d,
    applicationId,
    channel: "api",
    sentAt: d.sentAt ?? new Date(),
    messageIdHeader: d.messageId ?? null,
  });
  return Response.json(
    {
      id: message.id,
      trackingId: message.trackingId,
      messageId: message.messageIdHeader,
      trackOpens: message.tracked,
      engagementLevel: message.engagementLevel,
      openConfidence: message.openConfidence,
      openSources: message.openSources,
      pixelUrl: message.tracked ? pixelUrl(message.trackingId) : null,
      pixelHtml: message.tracked ? pixelHtml(message.trackingId) : null,
      applicationId,
      html,
      text,
    },
    { status: 201 },
  );
}

export async function GET(req: Request) {
  if (!apiAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const limit = z.coerce.number().int().min(1).max(500).safeParse(url.searchParams.get("limit") ?? 100);
  if (!limit.success) return Response.json({ error: "limit must be an integer between 1 and 500" }, { status: 400 });
  const rows = await db
    .select({
      id: messages.id,
      to: messages.toEmail,
      subject: messages.subject,
      status: messages.status,
      sentAt: messages.sentAt,
      openCount: messages.openCount,
      rawOpenCount: messages.rawOpenCount,
      rawClickCount: messages.rawClickCount,
      openConfidence: messages.openConfidence,
      openSources: messages.openSources,
      openContextCount: messages.openContextCount,
      engagementLevel: messages.engagementLevel,
      firstOpenedAt: messages.firstOpenedAt,
      lastOpenedAt: messages.lastOpenedAt,
      clickCount: messages.clickCount,
      repliedAt: messages.repliedAt,
      template: messages.template,
      trackOpens: messages.tracked,
      trackClicks: messages.trackClicks,
    })
    .from(messages)
    .where(to ? eq(messages.toEmail, to.toLowerCase()) : undefined)
    .orderBy(desc(messages.sentAt))
    .limit(limit.data);
  return Response.json({ messages: rows.map((row) => ({ ...row,
    engagementSignals: computeEngagement({ ...row, tracked: row.trackOpens }).signals,
  })) });
}
