import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { clicks, db, links, messages } from "@/db";
import { SELF_COOKIE } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { appUrl, classifyClick, clientIp } from "@/lib/tracking";
import { webUrl } from "@/lib/validation";
import { refreshTrackingInTransaction } from "@/lib/recount";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return Response.redirect(appUrl(), 302);
  const [link] = await db.select().from(links).where(eq(links.id, id));
  if (!link || !webUrl.safeParse(link.url).success) return Response.redirect(appUrl(), 302);
  try { await recordClick(link, req); } catch (err) { console.error("click", err); }
  return new Response(null, { status: 302, headers: { Location: link.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
async function recordClick(link: typeof links.$inferSelect, req: NextRequest) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [msg] = await tx.select().from(messages).where(eq(messages.id, link.messageId)).for("update");
    if (!msg || !msg.trackClicks || msg.status !== "sent") return;
    const now = new Date();
    const ip = clientIp(req.headers);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);
    const c = classifyClick({ userAgent: ua, ip, hasSelfCookie: req.cookies.has(SELF_COOKIE), selfIps: settings.selfIps,
      secondsSinceSend: msg.sentAt ? (now.getTime() - msg.sentAt.getTime()) / 1000 : null, graceSeconds: settings.graceSeconds,
      accept: req.headers.get("accept"), hasAcceptLanguage: !!req.headers.get("accept-language"),
      isPrefetch: /prefetch/i.test(`${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`),
    });
    await tx.insert(clicks).values({ linkId: link.id, messageId: msg.id, at: now, ip, userAgent: ua, ...c });
    // Link navigation never changes pixel confidence or creates an image-load event.
    await refreshTrackingInTransaction(tx, msg.id, settings.dedupeSeconds);
  });
}
