import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, messages, opens } from "@/db";
import { SELF_COOKIE } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { classifyHit, clientIp, PIXEL_GIF } from "@/lib/tracking";
import { refreshTrackingInTransaction } from "@/lib/recount";

export const dynamic = "force-dynamic";
const NO_CACHE = {
  "Content-Type": "image/gif", "Content-Length": String(PIXEL_GIF.length),
  // Advisory only: recipient proxies can still cache or prefetch images.
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  Pragma: "no-cache", Expires: "0",
};
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const trackingId = id.replace(/\.(gif|png)$/i, "");
    if (/^[A-Za-z0-9_-]{22}$/.test(trackingId)) await recordOpen(trackingId, req);
  } catch (err) { console.error("pixel", err); }
  return new Response(new Uint8Array(PIXEL_GIF), { headers: NO_CACHE });
}
async function recordOpen(trackingId: string, req: NextRequest) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    // Serialize pixel/click/reply changes so cached summaries cannot overwrite each other.
    const [msg] = await tx.select().from(messages).where(eq(messages.trackingId, trackingId)).for("update");
    if (!msg || !msg.tracked || msg.status !== "sent") return;
    const now = new Date();
    const ip = clientIp(req.headers);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);
    let secondsSinceFirstAppleHit: number | null = null;
    if (/AppleWebKit/i.test(ua) || ip?.startsWith("17.")) {
      const [first] = await tx.select({ at: opens.at }).from(opens)
        .where(and(eq(opens.messageId, msg.id), eq(opens.source, "apple"))).orderBy(asc(opens.at)).limit(1);
      if (first) secondsSinceFirstAppleHit = (now.getTime() - first.at.getTime()) / 1000;
    }
    const c = classifyHit({ userAgent: ua, ip, hasSelfCookie: req.cookies.has(SELF_COOKIE), selfIps: settings.selfIps,
      secondsSinceSend: msg.sentAt ? (now.getTime() - msg.sentAt.getTime()) / 1000 : null,
      graceSeconds: settings.graceSeconds, secondsSinceFirstAppleHit,
      accept: req.headers.get("accept"), hasAcceptLanguage: !!req.headers.get("accept-language"),
      isPrefetch: /prefetch/i.test(`${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`),
    });
    await tx.insert(opens).values({ messageId: msg.id, at: now, ip, userAgent: ua, ...c });
    await refreshTrackingInTransaction(tx, msg.id, settings.dedupeSeconds);
  });
}
