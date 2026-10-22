import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { createSessionToken, SELF_COOKIE, SESSION_COOKIE, sessionMaxAge } from "@/lib/session";
import { rememberSelfIp } from "@/lib/settings";
import { clientIp } from "@/lib/tracking";
import { consumeLoginAttempt } from "@/lib/login-limit";
import { requestOrigin, safeNextPath, sameOriginRequest } from "@/lib/request-security";
import { readTextBody } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req)) return Response.json({ error: "invalid origin" }, { status: 403 });
  if (req.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return Response.json({ error: "Expected a URL-encoded sign-in form" }, { status: 415 });
  }
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.length < 16 || (process.env.APP_SECRET?.length ?? 0) < 32) {
    return Response.json({ error: "Dashboard credentials are not configured. Run npm run setup:check." }, { status: 503 });
  }
  try {
    const limit = await consumeLoginAttempt();
    if (!limit.allowed) return Response.json({ error: "Too many sign-in attempts. Try again later." }, {
      status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Sign-in unavailable. Check the database connection and run npm run db:push." }, { status: 503 });
  }
  const body = await readTextBody(req, 8192);
  if ("error" in body) return body.error;
  const form = new URLSearchParams(body.text);
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const origin = requestOrigin(req);
  const back = (q: string) => NextResponse.redirect(new URL(`/login?${q}`, origin), 303);
  if (!safeEqual(password, expected)) return back("error=wrong");

  const res = NextResponse.redirect(new URL(safeNextPath(next, origin), origin), 303);
  const secure = new URL(origin).protocol === "https:";
  res.cookies.set(SESSION_COOKIE, createSessionToken(), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: sessionMaxAge });
  // Sent along with cross-site image loads, so pixels your own browser loads (e.g. a non-proxied webmail) count as yours.
  res.cookies.set(SELF_COOKIE, "1", { httpOnly: true, sameSite: secure ? "none" : "lax", secure, path: "/t/", maxAge: 365 * 86400 });
  await rememberSelfIp(clientIp(req.headers)).catch(() => {});
  return res;
}
