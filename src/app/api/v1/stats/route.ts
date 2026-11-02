import { apiAuthorized, unauthorized } from "@/lib/api";
import { totals } from "@/lib/stats";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!apiAuthorized(req)) return unauthorized();
  const value = new URL(req.url).searchParams.get("days");
  const days = z.coerce.number().int().min(1).max(3650).nullable().safeParse(value);
  if (!days.success) return Response.json({ error: "days must be an integer between 1 and 3650" }, { status: 400 });
  return Response.json(await totals({ days: days.data }));
}
