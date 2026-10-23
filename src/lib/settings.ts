import { eq } from "drizzle-orm";
import { db, settings } from "@/db";

export type AppSettings = {
  /** opens / clicks this soon after sending are not counted as a person */
  graceSeconds: number;
  /** Eligible loads within a source/IP burst closer than this count once. */
  dedupeSeconds: number;
  /** IPs seen on the dashboard; pixel hits from them are yours */
  selfIps: string[];
  /** days with no reply before a message shows up as a follow-up */
  followUpAfterDays: number;
};

const DEFAULTS: AppSettings = { graceSeconds: 20, dedupeSeconds: 60, selfIps: [], followUpAfterDays: 5 };

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "app"));
  return { ...DEFAULTS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await db
    .insert(settings)
    .values({ key: "app", value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}

/** Remembers the IP you use the dashboard from (most recent 10). */
export async function rememberSelfIp(ip: string | null) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return;
  const s = await getSettings();
  if (s.selfIps[0] === ip) return;
  await saveSettings({ selfIps: [ip, ...s.selfIps.filter((x) => x !== ip)].slice(0, 10) });
}
