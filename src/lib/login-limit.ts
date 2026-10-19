import { sql } from "drizzle-orm";
import { db } from "@/db";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, loginLimitResult } from "./request-security";

/** One durable, atomic bucket for this single-user dashboard. Never trust a spoofable IP. */
export function loginAttemptQuery(now = Date.now()) {
  const initial = JSON.stringify({ attempts: 1, resetAt: now + LOGIN_WINDOW_MS });
  return sql`
    insert into settings (key, value) values ('login-rate-limit', ${initial}::jsonb)
    on conflict (key) do update set value =
      case when (settings.value->>'resetAt')::bigint <= ${now}
        then excluded.value
        else jsonb_set(settings.value, '{attempts}',
          to_jsonb(least((settings.value->>'attempts')::int + 1, ${LOGIN_LIMIT + 1})))
      end
    returning value
  `;
}

export async function consumeLoginAttempt() {
  const now = Date.now();
  const rows = await db.execute<{ value: { attempts: number; resetAt: number } }>(loginAttemptQuery(now));
  return loginLimitResult(rows[0].value, now);
}
