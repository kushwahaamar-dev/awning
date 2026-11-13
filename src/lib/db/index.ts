import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

// With DATABASE_URL set this talks to a real Postgres; otherwise it runs Postgres in-process
// from ./.data so a fresh clone works with no setup. Both speak the same SQL.
async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = drizzlePg(url, { schema, casing: "snake_case" });
    await migratePg(db, { migrationsFolder });
    return db as unknown as Db;
  }
  const db = drizzlePglite(new PGlite(process.env.AWNING_DATA_DIR ?? ".data/pg"), { schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder });
  return db;
}

// Next's dev server reloads modules; keep one connection per process.
const globals = globalThis as { awningDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  return (globals.awningDb ??= connect());
}

export * from "./schema";
