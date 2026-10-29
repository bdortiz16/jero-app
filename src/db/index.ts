import "server-only";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";

type DB = ReturnType<typeof drizzlePostgres<typeof schema>>;

const isWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const globalForDb = globalThis as unknown as { __jeroDb?: DB; __jeroDbReady?: Promise<void> };

// En Cloudflare Workers un socket no puede reutilizarse entre peticiones:
// se abre una conexión por petición (una por ExecutionContext).
const perRequest = new WeakMap<object, DB>();

async function workersDb(): Promise<DB> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env, ctx } = await getCloudflareContext({ async: true });
  const cached = perRequest.get(ctx);
  if (cached) return cached;
  // Hyperdrive (recomendado) o conexión directa a Postgres/Neon.
  const url = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE?.connectionString ?? databaseUrl();
  if (!url) throw new Error("Falta la base de datos: configura Hyperdrive (binding HYPERDRIVE) o el secreto DATABASE_URL.");
  const db = drizzlePostgres(postgres(url, { max: 1, prepare: false, fetch_types: false }), { schema });
  perRequest.set(ctx, db);
  return db;
}

async function createLocal(): Promise<{ db: DB; ready: Promise<void> }> {
  const url = databaseUrl();
  if (url) {
    const client = postgres(url, { max: process.env.VERCEL ? 1 : 5, prepare: false });
    return { db: drizzlePostgres(client, { schema }), ready: Promise.resolve() };
  }
  if (process.env.VERCEL) {
    throw new Error("Falta la base de datos: agrega DATABASE_URL (Supabase) en las variables de entorno de Vercel.");
  }
  // Desarrollo: Postgres embebido en ./.data, migrado automáticamente.
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate }, path, fs] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("node:path"),
    import("node:fs"),
  ]);
  const dir = path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = drizzlePglite(new PGlite(dir), { schema });
  const ready = migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db: db as unknown as DB, ready };
}

/** Devuelve la conexión a la base de datos (con la base local, espera a que esté migrada). */
export async function getDb(): Promise<DB> {
  if (isWorkers) return workersDb();
  globalForDb.__jeroDbReady ??= createLocal().then(({ db, ready }) => {
    globalForDb.__jeroDb = db;
    return ready;
  });
  try {
    await globalForDb.__jeroDbReady;
  } catch (e) {
    // Permite reintentar en la siguiente petición si la conexión o migración falló.
    globalForDb.__jeroDbReady = undefined;
    throw e;
  }
  return globalForDb.__jeroDb!;
}

export { schema };
