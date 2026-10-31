import Link from "next/link";

const RANGES = [
  { v: "7", label: "7 days" },
  { v: "30", label: "30 days" },
  { v: "90", label: "90 days" },
  { v: "all", label: "All time" },
];

export function RangeTabs({ current, base, params = {} }: { current: string; base: string; params?: Record<string, string> }) {
  return (
    <div className="grid w-full grid-cols-4 rounded-lg border sm:w-auto border-zinc-300 bg-white p-0.5">
      {RANGES.map((r) => (
        <Link
          key={r.v}
          href={`${base}?${new URLSearchParams({ ...params, range: r.v })}`}
          aria-current={current === r.v ? "true" : undefined}
          className={`grid min-h-10 place-items-center rounded-md px-2 text-center text-xs font-medium sm:min-h-8 ${current === r.v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}

export const rangeDays = (v: unknown) => (v === "all" ? null : Number(v) || 30);
export const rangeKey = (v: unknown) => (typeof v === "string" && ["7", "30", "90", "all"].includes(v) ? v : "30");
