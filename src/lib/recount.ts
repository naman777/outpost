import { and, eq, sql } from "drizzle-orm";
import { clicks, db, messages, opens } from "@/db";
import { getSettings } from "./settings";

type Executor = Pick<typeof db, "execute">;

/** One derivation for live events, operator corrections and historical rebuilds. */
export function trackingSummaryQuery(messageId: string, dedupeSeconds: number) {
  return sql`
    with open_candidates as (
      select id, at, source, ip, confidence,
        lag(at) over (partition by source, coalesce(ip, '') order by at, id) as prev
      from opens where message_id = ${messageId} and is_human and confidence in ('high', 'medium')
    ), included_opens as (
      select * from open_candidates where prev is null or at - prev >= make_interval(secs => ${dedupeSeconds})
    ), click_candidates as (
      select id, at, link_id,
        lag(at) over (partition by link_id, source, coalesce(ip, '') order by at, id) as prev
      from clicks where message_id = ${messageId} and is_human and confidence in ('high', 'medium')
    ), included_clicks as (
      select * from click_candidates where prev is null or at - prev >= make_interval(secs => ${dedupeSeconds})
    ), mark_opens as (
      update opens set counted = (
        (select tracked from messages where id = ${messageId}) and id in (select id from included_opens)
      ) where message_id = ${messageId} returning id
    ), mark_clicks as (
      update clicks set counted = (
        (select track_clicks from messages where id = ${messageId}) and id in (select id from included_clicks)
      ) where message_id = ${messageId} returning id
    ), mark_links as (
      update links l set click_count = case when (select track_clicks from messages where id = ${messageId})
        then (select count(*)::int from included_clicks c where c.link_id = l.id) else 0 end
      where l.message_id = ${messageId} returning id
    ), evidence as (
      select
        (select count(*)::int from opens where message_id = ${messageId}) as raw_count,
        (select count(*)::int from clicks where message_id = ${messageId}) as raw_click_count,
        (select count(*)::int from included_opens) as open_count,
        (select min(at) from included_opens) as first_open,
        (select max(at) from included_opens) as last_open,
        coalesce((select jsonb_agg(source order by source) from (select distinct source from included_opens) s), '[]'::jsonb) as sources,
        (select count(distinct (source, ip))::int from included_opens where source in ('client', 'outlook') and ip is not null) as contexts,
        case when exists (select 1 from included_opens where confidence = 'high') then 'high'
          when exists (select 1 from included_opens) then 'medium' else 'none' end as confidence,
        (select count(*)::int from included_clicks) as click_count,
        (select min(at) from included_clicks) as first_click
    )
    update messages m set
      raw_open_count = e.raw_count,
      raw_click_count = e.raw_click_count,
      open_count = case when m.tracked then e.open_count else 0 end,
      first_opened_at = case when m.tracked then e.first_open else null end,
      last_opened_at = case when m.tracked then e.last_open else null end,
      open_sources = case when m.tracked then e.sources else '[]'::jsonb end,
      open_context_count = case when m.tracked then e.contexts else 0 end,
      open_confidence = case when m.tracked then e.confidence else 'none' end,
      click_count = case when m.track_clicks then e.click_count else 0 end,
      first_clicked_at = case when m.track_clicks then e.first_click else null end,
      engagement_level = case
        when m.replied_at is not null then 'confirmed'
        when m.track_clicks and e.click_count > 0 then 'likely'
        when m.tracked and e.open_count >= 2 and (jsonb_array_length(e.sources) >= 2 or e.contexts >= 2) then 'likely'
        when m.tracked and e.open_count > 0 then 'possible'
        when not m.tracked or e.raw_count > 0 or e.raw_click_count > 0 then 'unknown'
        else 'none' end
    from evidence e where m.id = ${messageId}`;
}

/** Caller must hold the message row lock. No database queries escape its transaction. */
export async function refreshTrackingInTransaction(executor: Executor, messageId: string, dedupeSeconds: number) {
  await executor.execute(trackingSummaryQuery(messageId, dedupeSeconds));
}

export async function recountOpens(messageId: string) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [message] = await tx.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).for("update");
    if (message) await refreshTrackingInTransaction(tx, messageId, settings.dedupeSeconds);
  });
}

export async function setOpenInclusion(messageId: string, openId: number, included: boolean) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [message] = await tx.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).for("update");
    if (!message) return;
    await tx.update(opens).set(included
      ? { isHuman: true, confidence: "high", reason: "manually included by operator; not proof of reading" }
      : { isHuman: false, confidence: "none", reason: "manually excluded by operator" })
      .where(and(eq(opens.id, openId), eq(opens.messageId, messageId)));
    await refreshTrackingInTransaction(tx, messageId, settings.dedupeSeconds);
  });
}

export async function setClickInclusion(messageId: string, clickId: number, included: boolean) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [message] = await tx.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).for("update");
    if (!message) return;
    await tx.update(clicks).set(included
      ? { isHuman: true, confidence: "medium", reason: "manually included by operator; recipient identity is not verified" }
      : { isHuman: false, confidence: "none", reason: "manually excluded by operator" })
      .where(and(eq(clicks.id, clickId), eq(clicks.messageId, messageId)));
    await refreshTrackingInTransaction(tx, messageId, settings.dedupeSeconds);
  });
}
