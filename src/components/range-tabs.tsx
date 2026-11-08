import Link from "next/link";

const RANGES = [
  { v: "7", label: "7 days" },
  { v: "30", label: "30 days" },
  { v: "90", label: "90 days" },
  { v: "all", label: "All time" },
];

export function RangeTabs({ current, base, params = {} }: { current: string; base: string; params?: Record<string, string> }) {
  return (
    <div className="range-tabs" aria-label="Date range">
      {RANGES.map((r) => (
        <Link
          key={r.v}
          href={`${base}?${new URLSearchParams({ ...params, range: r.v })}`}
          aria-current={current === r.v ? "true" : undefined}
          className="range-tab"
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}

export const rangeDays = (v: unknown) => (v === "all" ? null : Number(v) || 30);
export const rangeKey = (v: unknown) => (typeof v === "string" && ["7", "30", "90", "all"].includes(v) ? v : "30");
