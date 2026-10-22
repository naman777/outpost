import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { requestOrigin, sameOriginRequest } from "@/lib/request-security";

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req)) return Response.json({ error: "invalid origin" }, { status: 403 });
  const res = NextResponse.redirect(new URL("/login", requestOrigin(req)), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
