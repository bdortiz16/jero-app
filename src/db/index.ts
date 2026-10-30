import "server-only";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";
import { withTimeout } from "@/lib/timeout";

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
    const client = postgres(url, {
      max: process.env.VERCEL ? 3 : 5,
      prepare: false,
      onnotice: () => {},
      // En serverless la instancia se congela entre peticiones y el pooler cierra las conexiones inactivas:
      // sin estos límites, el driver reusa un socket muerto y la página se queda cargando.
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      connect_timeout: 10,
    });
    const db = drizzlePostgres(client, { schema });
    // En Vercel (o con AUTO_MIGRATE=true) las tablas se crean/actualizan solas al arrancar: no depende del build.
    if (process.env.VERCEL || process.env.AUTO_MIGRATE === "true") {
      const [{ migrate }, path, fs] = await Promise.all([
        import("drizzle-orm/postgres-js/migrator"),
        import("node:path"),
        import("node:fs"),
      ]);
      const folder = path.join(process.cwd(), "drizzle");
      const ready = (async () => {
        // Si las tablas ya están al día no se abre ninguna transacción de migración (evita bloqueos en cada arranque).
        try {
          const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
          const [{ n }] = await withTimeout(
            client<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`,
            8_000,
            "timeout",
          );
          if (n >= journal.entries.length) return;
        } catch {
          // Primera vez (no existe la tabla de migraciones) o no se pudo leer: se migra normalmente.
        }
        // Si la migración queda esperando un bloqueo, falla en vez de dejar todas las páginas cargando.
        await withTimeout(
          migrate(db, { migrationsFolder: folder }),
          20_000,
          "La actualización de tablas está bloqueada. Abre /api/diagnostico?liberar=1 y recarga.",
        );
      })();
      return { db, ready };
    }
    return { db, ready: Promise.resolve() };
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
