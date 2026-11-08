import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { rememberSelfIp } from "@/lib/settings";
import { clientIp } from "@/lib/tracking";
import { requestOrigin } from "@/lib/request-security";

const IP_COOKIE = "mp_ip";

/** Everything except the public tracking endpoints, the API (bearer auth) and the login page needs a session. */
export async function proxy(req: NextRequest) {
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    const res = NextResponse.next();
    // Pixel hits from the network you use the dashboard on are your own opens. Only touch the
    // database when that IP changes, not on every page view.
    const ip = clientIp(req.headers);
    if (ip && req.cookies.get(IP_COOKIE)?.value !== ip) {
      await rememberSelfIp(ip).catch(() => {});
      res.cookies.set(IP_COOKIE, ip, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
    }
    return res;
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", requestOrigin(req));
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!t/|api/v1/|api/cron/|api/auth/login|login|_next/|favicon.ico|icon.svg|logo.png).*)"],
};
