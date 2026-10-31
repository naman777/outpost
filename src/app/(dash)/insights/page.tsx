import Link from "next/link";
import { RangeTabs, rangeDays, rangeKey } from "@/components/range-tabs";
import { Badge, Empty, PageHeader, RateBar } from "@/components/ui";
import { duration, pct } from "@/lib/format";
import { DIMENSIONS, groupBy, totals, type Agg, type Dimension } from "@/lib/stats";

const ORDER: Dimension[] = ["variant", "template", "subject", "words", "followup", "attachment", "weekday", "hour", "region", "track", "sender", "channel"];
/** Below this many sends a rate is noise; such rows are greyed out and never marked best. */
const MIN_SAMPLE = 5;

export default async function Insights({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const dim = (typeof sp.by === "string" && Object.hasOwn(DIMENSIONS, sp.by) ? sp.by : "variant") as Dimension;
  const key = rangeKey(sp.range);
  const days = rangeDays(key);
  const [rows, all] = await Promise.all([groupBy(dim, { days }), totals({ days })]);
  const sorted = dim === "subject" ? [...rows].sort((a, b) => b.sent - a.sent) : rows;
  const sampled = rows.filter((r) => r.delivered >= MIN_SAMPLE);
  const best = (f: (r: Agg) => number | null) =>
    sampled.reduce<Agg | null>((b, r) => ((f(r) ?? 0) > (b ? (f(b) ?? 0) : 0) ? r : b), null)?.key;
  const bestReply = best((r) => r.replyRate);
  const bestOpen = best((r) => r.openRate);

  return (
    <>
      <PageHeader title="Content insights" sub="Compare reply outcomes and estimated image-load activity.">
        <RangeTabs current={key} base="/insights" params={{ by: dim }} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {ORDER.map((d) => (
          <Link
            key={d}
            href={`/insights?by=${d}&range=${key}`}
            className={`filter-chip rounded-md px-3 py-1 text-xs ${dim === d ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"}`}
          >
            {DIMENSIONS[d].label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>No sent mail in this range yet.</Empty>
      ) : (
        <div className="records">
          <table role="table" aria-label="Content insights" className="w-full">
            <thead role="rowgroup" className="border-b border-zinc-200">
              <tr role="row">
                <th role="columnheader" scope="col" className="th">{DIMENSIONS[dim].label}</th>
                <th role="columnheader" scope="col" className="th text-right">Sent</th>
                <th role="columnheader" scope="col" className="th">Estimated open rate</th>
                <th role="columnheader" scope="col" className="th">Reply rate</th>
                <th role="columnheader" scope="col" className="th text-right">Likely activity</th>
                <th role="columnheader" scope="col" className="th text-right">Estimated click rate</th>
                <th role="columnheader" scope="col" className="th text-right">Bounced</th>
                <th role="columnheader" scope="col" className="th text-right">Median to estimated open</th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-zinc-100">
              <tr role="row" className="bg-zinc-50 font-medium">
                <td role="cell" className="td">All</td>
                <Cells r={all} />
              </tr>
              {sorted.map((r) => (
                <tr role="row" key={r.key} className={r.delivered < MIN_SAMPLE ? "text-zinc-400" : ""}>
                  <td role="cell" className="td max-w-sm">
                    <span className="break-words">{r.key.replace(/^\d\.\s/, "")}</span>{" "}
                    {r.key === bestReply && <Badge tone="green">best replies</Badge>}{" "}
                    {r.key === bestOpen && r.key !== bestReply && <Badge tone="blue">most estimated opens</Badge>}
                  </td>
                  <Cells r={r} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-zinc-500">
        Estimated open rate counts only emails that carried the pixel and did not bounce, and leaves out Apple privacy prefetches, scanners
        and your own views when detected. Filtering is heuristic; an image load does not prove reading. Reply rate covers everything delivered, including imported mail without a pixel. Rows with fewer than{" "}
        {MIN_SAMPLE} delivered emails are greyed out: too few to judge.
      </p>
    </>
  );
}

function Cells({ r }: { r: Agg }) {
  return (
    <>
      <td role="cell" data-label="Sent" className="td text-right tabular-nums">{r.sent}</td>
      <td role="cell" data-label="Estimated open rate" className="td">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
          <RateBar value={r.openRate} /> {pct(r.openRate)}
        </div>
      </td>
      <td role="cell" data-label="Reply rate" className="td">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
          <RateBar value={r.replyRate} /> {pct(r.replyRate)} <span className="text-xs text-zinc-400">({r.replied})</span>
        </div>
      </td>
      <td role="cell" data-label="Likely activity" className="td text-right tabular-nums">{r.engagementCounts.likely}</td>
      <td role="cell" data-label="Estimated click rate" className="td text-right tabular-nums">{pct(r.clickRate)}</td>
      <td role="cell" data-label="Bounced" className="td text-right tabular-nums">{r.bounced}</td>
      <td role="cell" data-label="Median to estimated open" className="td text-right tabular-nums">{duration(r.medianOpenMin)}</td>
    </>
  );
}
