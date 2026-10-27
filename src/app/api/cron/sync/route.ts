import { checkBearer } from "@/lib/session";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron calls this with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!checkBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ results: await syncAll() });
}
