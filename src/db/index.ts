import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

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
    dbInstance = drizzle(neon(getDatabaseUrl()), { schema });
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
