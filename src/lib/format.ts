const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`);

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function day(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}

export function ago(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return day(d);
}

export function duration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 48) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

export const SOURCE_LABEL: Record<string, string> = {
  gmail_proxy: "Gmail proxy",
  yahoo_proxy: "Yahoo proxy",
  apple: "Possible Apple privacy/client load",
  outlook: "Outlook",
  client: "Mail client / browser",
  bot: "Scanner / bot",
  self: "You",
};
