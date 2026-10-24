import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { accounts, db } from "@/db";
import { encrypt } from "@/lib/crypto";
import { exchangeCode } from "@/lib/providers/gmail";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { safeEqual } from "@/lib/crypto";
import { requestOrigin } from "@/lib/request-security";

export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl;
  const fail = (msg: string) => NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent(msg)}`, requestOrigin(req)));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  if (!url.searchParams.get("state") || !safeEqual(url.searchParams.get("state")!, req.cookies.get("mp_oauth_state")?.value ?? "")) {
    return fail("OAuth state mismatch, try again");
  }
  try {
    const { refreshToken, email } = await exchangeCode(url.searchParams.get("code") ?? "");
    if (!refreshToken || !email) return fail("Google did not return a refresh token");
    const [existing] = await db.select().from(accounts).where(eq(accounts.email, email));
    if (existing && existing.kind === "gmail") {
      await db.update(accounts).set({ gmailRefreshTokenEnc: encrypt(refreshToken), active: true }).where(eq(accounts.id, existing.id));
    } else {
      await db.insert(accounts).values({ label: email, email, kind: "gmail", gmailRefreshTokenEnc: encrypt(refreshToken) });
    }
    const res = NextResponse.redirect(new URL("/accounts?connected=1", requestOrigin(req)));
    res.cookies.delete("mp_oauth_state");
    return res;
  } catch (err) {
    return fail((err as Error).message);
  }
}
