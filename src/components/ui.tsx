import Link from "next/link";
import type { ReactNode } from "react";
import { computeEngagement, ENGAGEMENT_LABEL, OPEN_ACCURACY_NOTE, type EngagementEvidence } from "@/lib/engagement";

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-600">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-3 py-3 sm:p-4">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl leading-tight font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

const TONES = {
  zinc: "bg-zinc-100 text-zinc-700",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  blue: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

export function Badge({ tone = "zinc", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<string, keyof typeof TONES> = {
  researching: "zinc",
  emailed: "blue",
  opened: "violet",
  replied: "green",
  interviewing: "green",
  offer: "green",
  rejected: "red",
  ghosted: "amber",
  closed: "zinc",
};

/** Opened / clicked / replied / bounced pill for a message. */
export function MessageState({
  m,
}: {
  m: { status: string; openCount: number; clickCount: number; repliedAt: Date | string | null; tracked: boolean };
}) {
  if (m.status === "bounced") return <Badge tone="red">Bounced</Badge>;
  if (m.status === "failed") return <Badge tone="red">Failed</Badge>;
  if (m.status === "draft") return <Badge>Draft</Badge>;
  if (m.repliedAt) return <Badge tone="green">Replied</Badge>;
  if (m.clickCount > 0) return <span title="Filtered browser-like navigation; automated requests remain possible."><Badge tone="violet">Likely click</Badge></span>;
  if (m.openCount > 0) return <span title={OPEN_ACCURACY_NOTE}><Badge tone="blue">Estimated open ×{m.openCount}</Badge></span>;
  if (!m.tracked) return <Badge>Opens off</Badge>;
  return <span title={OPEN_ACCURACY_NOTE}><Badge tone="amber">No open detected</Badge></span>;
}

export function EngagementBadge({ m }: { m: EngagementEvidence }) {
  const result = computeEngagement(m);
  const tone = result.level === "confirmed" ? "green" : result.level === "likely" ? "blue" : result.level === "possible" ? "amber" : "zinc";
  return <span title={result.signals.join(" ")}><Badge tone={tone}>{ENGAGEMENT_LABEL[result.level]}</Badge></span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{children}</div>;
}

export function RateBar({ value }: { value: number | null }) {
  const w = value == null ? 0 : Math.min(100, value * 100);
  return (
    <div className="h-1.5 w-14 max-w-full overflow-hidden sm:w-20 rounded-full bg-zinc-100">
      <div className="h-full rounded-full bg-zinc-800" style={{ width: `${w}%` }} />
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900">
      {children}
    </Link>
  );
}
