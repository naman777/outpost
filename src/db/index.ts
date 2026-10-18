import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Postgres (Neon) URL.");
  // prepare:false keeps it working behind poolers such as Neon's pgbouncer endpoint.
  const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX) || 10, idle_timeout: 20 });
  return drizzle(client, { schema });
}

/** Lazily created so `next build` works without a database. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    globalForDb.__db ??= create();
    return Reflect.get(globalForDb.__db, prop);
  },
});

export * from "./schema";
