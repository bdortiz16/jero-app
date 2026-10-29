import "server-only";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzlePostgres<typeof schema>>;

const globalForDb = globalThis as unknown as { __jeroDb?: DB; __jeroDbReady?: Promise<void> };

function create(): { db: DB; ready: Promise<void> } {
  if (process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
    return { db: drizzlePostgres(client, { schema }), ready: Promise.resolve() };
  }
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error("Falta DATABASE_URL: configura la base Postgres (Neon) en las variables de entorno de Vercel.");
  }
  // Desarrollo: Postgres embebido en ./.data, migrado automáticamente.
  const dir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  const ready = migratePglite(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db: db as unknown as DB, ready };
}

/** Devuelve la conexión (creada al primer uso); con la base local espera a que esté migrada. */
export async function getDb(): Promise<DB> {
  if (!globalForDb.__jeroDb) {
    const { db, ready } = create();
    globalForDb.__jeroDb = db;
    globalForDb.__jeroDbReady = ready;
  }
  try {
    await globalForDb.__jeroDbReady;
  } catch (e) {
    // Permite reintentar en la siguiente petición si la migración falló.
    globalForDb.__jeroDb = undefined;
    throw e;
  }
  return globalForDb.__jeroDb!;
}

export { schema };
