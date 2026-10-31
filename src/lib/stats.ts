import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { EngagementLevel } from "./engagement";

export const TZ = process.env.APP_TIMEZONE || "UTC";

export type Agg = {
  key: string;
  sent: number;
  delivered: number;
  bounced: number;
  tracked: number;
  opened: number;
  clicked: number;
  linkTracked: number;
  replied: number;
  openRate: number | null;
  replyRate: number | null;
  clickRate: number | null;
  medianOpenMin: number | null;
  medianReplyHours: number | null;
  engagementCounts: Record<EngagementLevel, number>;
};

/**
 * Rates use the right denominators: open rate only over mail that carried a pixel and was not bounced,
 * click rate only over mail with click tracking, reply rate over everything delivered.
 */
const AGG = sql`
  count(*)::int as sent,
  count(*) filter (where m.status <> 'bounced')::int as delivered,
  count(*) filter (where m.status = 'bounced')::int as bounced,
  count(*) filter (where m.tracked and m.status <> 'bounced')::int as tracked,
  count(*) filter (where m.tracked and m.status <> 'bounced' and m.open_count > 0)::int as opened,
  count(*) filter (where m.track_clicks and m.status <> 'bounced')::int as "linkTracked",
  count(*) filter (where m.track_clicks and m.click_count > 0)::int as clicked,
  count(*) filter (where m.replied_at is not null)::int as replied,
  count(*) filter (where m.engagement_level = 'confirmed')::int as "engagementConfirmed",
  count(*) filter (where m.engagement_level = 'likely')::int as "engagementLikely",
  count(*) filter (where m.engagement_level = 'possible')::int as "engagementPossible",
  count(*) filter (where m.engagement_level = 'unknown')::int as "engagementUnknown",
  count(*) filter (where m.engagement_level = 'none')::int as "engagementNone",
  percentile_cont(0.5) within group (order by extract(epoch from (m.first_opened_at - m.sent_at)) / 60)
    filter (where m.first_opened_at is not null) as "medianOpenMin",
  percentile_cont(0.5) within group (order by extract(epoch from (m.replied_at - m.sent_at)) / 3600)
    filter (where m.replied_at is not null) as "medianReplyHours"`;

const BASE_WHERE = sql`m.sent_at is not null and m.status in ('sent','bounced')`;

function withRates(r: Record<string, unknown>): Agg {
  const n = (k: string) => Number(r[k] ?? 0);
  const rate = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    key: String(r.key ?? "—"),
    sent: n("sent"),
    delivered: n("delivered"),
    bounced: n("bounced"),
    tracked: n("tracked"),
    opened: n("opened"),
    clicked: n("clicked"),
    linkTracked: n("linkTracked"),
    replied: n("replied"),
    openRate: rate(n("opened"), n("tracked")),
    replyRate: rate(n("replied"), n("delivered")),
    clickRate: rate(n("clicked"), n("linkTracked")),
    medianOpenMin: r.medianOpenMin == null ? null : Number(r.medianOpenMin),
    medianReplyHours: r.medianReplyHours == null ? null : Number(r.medianReplyHours),
    engagementCounts: { confirmed: n("engagementConfirmed"), likely: n("engagementLikely"), possible: n("engagementPossible"), unknown: n("engagementUnknown"), none: n("engagementNone") },
  };
}

export type Range = { days?: number | null };
const rangeSql = (r: Range) => (r.days ? sql` and m.sent_at > now() - make_interval(days => ${r.days})` : sql``);

export async function totals(r: Range = {}): Promise<Agg> {
  const rows = await db.execute(sql`select 'all' as key, ${AGG} from messages m where ${BASE_WHERE} ${rangeSql(r)}`);
  return withRates(rows[0] as Record<string, unknown>);
}

export const DIMENSIONS = {
  template: { label: "Template", expr: sql`coalesce(m.template, '(none)')` },
  variant: { label: "Template / variant", expr: sql`coalesce(m.template, '(none)') || ' · ' || coalesce(m.variant, '—')` },
  subject: { label: "Subject line", expr: sql`m.subject` },
  words: {
    label: "Email length",
    expr: sql`case when m.word_count < 75 then '1. under 75 words' when m.word_count < 125 then '2. 75–124 words'
      when m.word_count < 175 then '3. 125–174 words' when m.word_count < 250 then '4. 175–249 words' else '5. 250+ words' end`,
  },
  weekday: { label: "Day sent", expr: sql`to_char(m.sent_at at time zone ${TZ}, 'ID. Dy')` },
  hour: { label: "Hour sent", expr: sql`to_char(m.sent_at at time zone ${TZ}, 'HH24":00"')` },
  followup: { label: "First mail vs follow-up", expr: sql`case when m.follow_up_of is null then 'First email' else 'Follow-up' end` },
  attachment: { label: "Attachment", expr: sql`case when m.has_attachment then 'With attachment' else 'No attachment' end` },
  region: { label: "Region", expr: sql`coalesce(a.region, '(unknown)')` },
  track: { label: "Track", expr: sql`coalesce(a.track, '(unknown)')` },
  sender: { label: "Sending mailbox", expr: sql`coalesce(m.from_email, '(unknown)')` },
  channel: { label: "How it was sent", expr: sql`m.channel` },
} satisfies Record<string, { label: string; expr: SQL }>;

export type Dimension = keyof typeof DIMENSIONS;

export async function groupBy(dim: Dimension, r: Range = {}, minSent = 1): Promise<Agg[]> {
  const rows = await db.execute(sql`
    select ${DIMENSIONS[dim].expr} as key, ${AGG}
    from messages m left join applications a on a.id = m.application_id
    where ${BASE_WHERE} ${rangeSql(r)}
    group by 1 having count(*) >= ${minSent}
    order by 1`);
  return (rows as unknown as Record<string, unknown>[]).map(withRates);
}

export async function daily(days = 30) {
  const rows = await db.execute(sql`
    with d as (select generate_series((now() at time zone ${TZ})::date - ${days - 1}::int, (now() at time zone ${TZ})::date, '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(m.id)::int as sent,
      count(m.id) filter (where m.open_count > 0 and m.tracked)::int as opened,
      count(m.id) filter (where m.replied_at is not null)::int as replied,
      count(m.id) filter (where m.status = 'bounced')::int as bounced
    from d left join messages m on (m.sent_at at time zone ${TZ})::date = d.day and m.status in ('sent','bounced')
    group by d.day order by d.day`);
  return rows as unknown as { day: string; sent: number; opened: number; replied: number; bounced: number }[];
}

export async function openSources(r: Range = {}) {
  const rows = await db.execute(sql`
    select o.source, o.counted as "isHuman", count(*)::int as n
    from opens o join messages m on m.id = o.message_id
    where true ${rangeSql(r)}
    group by 1, 2 order by n desc`);
  return rows as unknown as { source: string; isHuman: boolean; n: number }[];
}

export type MsgRow = {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  company: string | null;
  sentAt: string;
  openCount: number;
  lastOpenedAt: string | null;
  tracked: boolean;
};

/** Delivered, unanswered, older than N days, and not followed up yet. Opened ones first. */
export async function followUpsDue(limit = 25) {
  // the threshold comes from settings inside the query, so this needs no separate settings round trip
  const afterDays = sql`coalesce((select (value->>'followUpAfterDays')::int from settings where key = 'app'), 5)`;
  const rows = await db.execute(sql`
    select m.id, m.to_email as "toEmail", m.to_name as "toName", m.subject, a.company, m.sent_at as "sentAt",
      m.open_count as "openCount", m.last_opened_at as "lastOpenedAt", m.tracked
    from messages m left join applications a on a.id = m.application_id
    where m.status = 'sent' and m.replied_at is null and m.sent_at < now() - make_interval(days => ${afterDays})
      and not exists (select 1 from messages f where f.follow_up_of = m.id)
      and coalesce(a.status, 'emailed') in ('emailed', 'opened', 'researching')
    order by (m.open_count > 0) desc, m.last_opened_at desc nulls last, m.sent_at asc
    limit ${limit}`);
  return rows as unknown as MsgRow[];
}

/** Opened more than once in the last 3 days and no reply yet: worth a nudge. */
export async function hotLeads(limit = 10) {
  const rows = await db.execute(sql`
    select m.id, m.to_email as "toEmail", m.to_name as "toName", m.subject, a.company, m.sent_at as "sentAt",
      m.open_count as "openCount", m.last_opened_at as "lastOpenedAt", m.tracked
    from messages m left join applications a on a.id = m.application_id
    where m.replied_at is null and m.status = 'sent' and m.open_count >= 2 and m.last_opened_at > now() - interval '3 days'
    order by m.open_count desc, m.last_opened_at desc limit ${limit}`);
  return rows as unknown as MsgRow[];
}

export async function activity(limit = 30) {
  const rows = await db.execute(sql`
    select * from (
      select 'open' as kind, o.at, m.id, m.to_email as "toEmail", m.subject, o.source as detail
        from opens o join messages m on m.id = o.message_id where o.counted
      union all
      select 'click', c.at, m.id, m.to_email, m.subject, l.url
        from clicks c join messages m on m.id = c.message_id join links l on l.id = c.link_id where c.counted
      union all
      select r.kind, r.at, m.id, m.to_email, m.subject, r.snippet
        from replies r join messages m on m.id = r.message_id
    ) x order by at desc limit ${limit}`);
  return rows as unknown as { kind: string; at: string; id: string; toEmail: string; subject: string; detail: string | null }[];
}

/** Per-message evidence, including loads deliberately excluded from estimated opens. */
export async function messageOpenSources(messageId: string) {
  const rows = await db.execute(sql`
    select source, confidence, count(*)::int as raw,
      count(*) filter (where counted)::int as included
    from opens where message_id = ${messageId} group by source, confidence order by raw desc, source
  `);
  return rows as unknown as { source: string; confidence: string; raw: number; included: number }[];
}
