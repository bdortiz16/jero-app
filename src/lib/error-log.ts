import "server-only";
import postgres from "postgres";
import { databaseUrl } from "@/db/url";
import { withTimeout } from "./timeout";

export type LoggedError = { digest: string | null; path: string | null; message: string; at: string };

/** Conexión propia y corta: debe funcionar aunque la de la app esté fallando. */
async function withConn<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 1, onnotice: () => {} });
  try {
    return await withTimeout(fn(sql), 6_000, "error-log: sin respuesta");
  } finally {
    sql.end({ timeout: 1 }).catch(() => {});
  }
}

const ensureTable = (sql: postgres.Sql) =>
  sql`create table if not exists app_errors (
    id serial primary key, digest text, path text, message text not null, created_at timestamptz not null default now()
  )`;

/** Guarda el mensaje real de un error del servidor (Vercel lo oculta en la página). */
export async function logServerError(err: unknown, path: string | null) {
  const e = err as { message?: string; digest?: string; cause?: { message?: string } };
  const message = [e?.message, e?.cause?.message].filter(Boolean).join(" | causa: ").replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 2000);
  await withConn(async (sql) => {
    await ensureTable(sql);
    await sql`insert into app_errors (digest, path, message) values (${e?.digest ?? null}, ${path}, ${message || String(err)})`;
    await sql`delete from app_errors where id not in (select id from app_errors order by id desc limit 200)`;
  }).catch(() => {});
}

export async function recentServerErrors(limit = 8): Promise<LoggedError[]> {
  const rows = await withConn(async (sql) => {
    await ensureTable(sql);
    return sql<LoggedError[]>`select digest, path, message, created_at::text as at from app_errors order by id desc limit ${limit}`;
  }).catch(() => null);
  return rows ? [...rows] : [];
}
