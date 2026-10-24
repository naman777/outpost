import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { randomId } from "@/lib/crypto";
import { authUrl, gmailConfigured } from "@/lib/providers/gmail";
import { requestOrigin } from "@/lib/request-security";

/** Starts "Connect Gmail". Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. */
export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!gmailConfigured()) {
    return NextResponse.redirect(new URL("/accounts?error=google-not-configured", requestOrigin(req)));
  }
  const state = randomId();
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("mp_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: new URL(requestOrigin(req)).protocol === "https:", path: "/", maxAge: 600 });
  return res;
}
