import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let dbInstance: Database | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
}

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(postgres(getDatabaseUrl(), { max: 1 }), { schema });
  }
  return dbInstance;
}

// Keep existing `db.xxx` call sites unchanged while deferring the connection
// (and the DATABASE_URL check) until first use. This prevents the production
// build from failing during module evaluation when DATABASE_URL is absent.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
