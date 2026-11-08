import Link from "next/link";
import { Icon } from "@/components/icon";
import { DailyChart } from "@/components/daily-chart";
import { RangeTabs, rangeDays, rangeKey } from "@/components/range-tabs";
import { SyncButton } from "@/components/sync-button";
import { Badge, Empty, PageHeader, Stat, TextLink } from "@/components/ui";
import { ago, duration, pct, SOURCE_LABEL } from "@/lib/format";
import { ENGAGEMENT_LABEL, ENGAGEMENT_LEVELS, OPEN_ACCURACY_NOTE } from "@/lib/engagement";
import { getSettings } from "@/lib/settings";
import { activity, daily, followUpsDue, hotLeads, openSources, totals, type MsgRow } from "@/lib/stats";

export default async function Overview({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const key = rangeKey(sp.range);
  const days = rangeDays(key);
  // all independent: one round of parallel queries
  const [s, t, series, due, hot, feed, sources] = await Promise.all([
    getSettings(),
    totals({ days }),
    daily(days && days <= 90 ? days : 60),
    followUpsDue(),
    hotLeads(),
    activity(25),
    openSources({ days }),
  ]);
  const machine = sources.filter((x) => !x.isHuman).reduce((n, x) => n + x.n, 0);
  const human = sources.filter((x) => x.isHuman).reduce((n, x) => n + x.n, 0);

  return (
    <>
      <PageHeader title="Overview" sub="Delivery, engagement, and the conversations worth following up.">
        <RangeTabs current={key} base="/" />
        <SyncButton />
        <Link href="/compose" className="btn"><Icon name="compose" />New email</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat label="Sent" icon={<Icon name="mail" />} value={t.sent} hint={`${t.delivered} delivered · ${t.bounced} bounced`} />
        <Stat label="Estimated open rate" icon={<Icon name="eye" />} value={pct(t.openRate)} hint={`${t.opened} of ${t.tracked} tracked emails`} />
        <Stat label="Reply rate" icon={<Icon name="reply" />} value={pct(t.replyRate)} hint={`${t.replied} replies`} />
        <Stat
          label="Estimated click rate"
          icon={<Icon name="click" />}
          value={pct(t.clickRate)}
          hint={t.linkTracked ? `${t.clicked} of ${t.linkTracked} with link tracking` : "link tracking is off"}
        />
      </div>
      <div className="metric-strip">
        <Stat compact label="Median to first estimated open" value={duration(t.medianOpenMin)} />
        <Stat compact label="Median time to reply" value={duration(t.medianReplyHours == null ? null : t.medianReplyHours * 60)} />
        <Stat compact label="Likely activity" value={t.engagementCounts.likely} hint="filtered clicks or correlated image loads" />
        <Stat compact label="Pixel hits not counted" value={machine} hint={`${human} included image-load estimates`} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="section-heading">Daily volume</h2><p className="mb-5 mt-1 text-xs text-zinc-500">Your sending and engagement over time.</p>
          <DailyChart data={series} />
        </section>
        <section className="card p-5">
          <h2 className="section-heading">Engagement evidence</h2>
          <div className="mt-3">{ENGAGEMENT_LEVELS.map((level) => <div className="evidence-row" key={level}><span className="text-xs text-zinc-500">{ENGAGEMENT_LABEL[level]}</span><span className="evidence-value">{t.engagementCounts[level]}</span></div>)}</div>
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">{OPEN_ACCURACY_NOTE}</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Follow-ups due</h2>
          <p className="mb-3 text-xs text-zinc-500">No reply after {s.followUpAfterDays} days and not followed up yet. Estimated-open signals first.</p>
          <MsgList rows={due} empty="Nothing due. Nice." />
        </section>
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Recent image-load activity</h2>
          <p className="mb-3 text-xs text-zinc-500">2+ estimated opens in the last 3 days, no reply yet. Repeated loads do not prove interest.</p>
          <MsgList rows={hot} empty="No repeat image-load estimates right now." />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
          {feed.length === 0 ? (
            <Empty>No opens, clicks or replies yet.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {feed.map((f, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-1 py-3 text-sm sm:flex sm:gap-3">
                  <div className="w-fit"><Badge tone={f.kind === "reply" ? "green" : f.kind === "bounce" ? "red" : f.kind === "click" ? "violet" : "blue"}>
                    {f.kind === "open" ? "Estimated open" : f.kind === "click" ? "Likely click" : f.kind === "reply" ? "Replied" : "Bounced"}
                  </Badge></div>
                  <div className="col-span-2 row-start-2 min-w-0 flex-1">
                    <Link href={`/messages/${f.id}`} className="font-medium hover:underline">{f.toEmail}</Link>
                    <div className="text-xs leading-relaxed text-zinc-500">
                      {f.subject}
                      {f.kind === "open" && f.detail ? ` · via ${SOURCE_LABEL[f.detail] ?? f.detail}` : ""}
                      {f.kind === "click" && f.detail ? ` · ${f.detail}` : ""}
                      {(f.kind === "reply" || f.kind === "bounce") && f.detail ? ` · ${f.detail}` : ""}
                    </div>
                  </div>
                  <span className="self-center text-right text-xs text-zinc-500">{ago(f.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Where image loads come from</h2>
          {sources.length === 0 ? (
            <Empty>No pixel hits yet.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {sources.map((x) => (
                <li key={`${x.source}${x.isHuman}`} className="flex items-center justify-between">
                  <span>
                    {SOURCE_LABEL[x.source] ?? x.source} {!x.isHuman && <span className="text-xs text-zinc-400">(not counted)</span>}
                  </span>
                  <span className="tabular-nums text-zinc-600">{x.n}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            Apple Mail loads images for privacy on delivery, scanners fetch links, and you open your own Sent folder. Those detected by the filters are kept
            out of the estimated open rate. Replies are the number to trust most. See <TextLink href="/settings">Settings</TextLink>.
          </p>
        </section>
      </div>
    </>
  );
}

function MsgList({ rows, empty }: { rows: MsgRow[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-zinc-100">
      {rows.map((m) => (
        <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-3 text-sm sm:flex sm:gap-3">
          <div className="col-span-2 min-w-0 flex-1">
            <Link href={`/messages/${m.id}`} className="font-medium hover:underline">
              {m.company ?? m.toName ?? m.toEmail}
            </Link>
            <div className="text-xs leading-relaxed text-zinc-500">
              {m.toEmail} · {m.subject}
            </div>
          </div>
          <div className="text-xs text-zinc-500 sm:shrink-0 sm:text-right">
            {m.openCount > 0 ? <Badge tone="blue">Estimated open ×{m.openCount}</Badge> : m.tracked ? <Badge tone="amber">No open detected</Badge> : <Badge>Opens off</Badge>}
            <div className="mt-0.5">sent {ago(m.sentAt)}</div>
          </div>
          <Link href={`/compose?followUpOf=${m.id}`} className="btn-ghost shrink-0 text-xs">Follow up</Link>
        </li>
      ))}
    </ul>
  );
}
