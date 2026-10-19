import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { loginAttemptQuery } from "./login-limit";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, loginLimitResult } from "./request-security";

test("Postgres throttle shares one atomic counter across callers and resets only after expiry", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create table settings (key text primary key, value jsonb not null)");
    const db = drizzle(pg);
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: LOGIN_LIMIT + 5 }, async () => {
      const result = await db.execute<{ value: { attempts: number; resetAt: number } }>(loginAttemptQuery(now));
      return result.rows[0].value;
    }));
    assert.equal(results.filter((row) => loginLimitResult(row, now).allowed).length, LOGIN_LIMIT);
    const stored = await pg.query<{ count: number }>("select count(*)::int as count from settings");
    assert.equal(stored.rows[0].count, 1);
    const later = await db.execute<{ value: { attempts: number; resetAt: number } }>(loginAttemptQuery(now + LOGIN_WINDOW_MS));
    assert.equal(later.rows[0].value.attempts, 1);
    assert.equal(later.rows[0].value.resetAt, now + 2 * LOGIN_WINDOW_MS);
  } finally {
    await pg.close();
  }
});
