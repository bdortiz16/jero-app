import "server-only";
import postgres from "postgres";
import { databaseUrl } from "@/db/url";
import { withTimeout } from "./timeout";

/** Conexión independiente y corta (no usa la de la app, que podría estar trabada). */
async function withProbe<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const url = databaseUrl();
  if (!url) throw new Error("Sin DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 1, onnotice: () => {} });
  try {
    return await withTimeout(fn(sql), 10_000, "Base de datos: sin respuesta en 10s");
  } finally {
    sql.end({ timeout: 1 }).catch(() => {});
  }
}

export type DbActivity = { pid: number; estado: string; espera: string | null; segundos: number; consulta: string };

/** Consultas activas o trabadas en la base (bloqueos, transacciones abiertas). */
export function dbActivity() {
  return withProbe(async (sql) => {
    const rows = await sql<DbActivity[]>`
      select pid, state as estado, wait_event_type as espera,
        coalesce(extract(epoch from now() - coalesce(xact_start, query_start)), 0)::int as segundos,
        left(regexp_replace(query, '\\s+', ' ', 'g'), 90) as consulta
      from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid() and usename = current_user
        and state is not null and state <> 'idle'
      order by segundos desc limit 10`;
    const tables = await sql<{ t: string; ok: boolean }[]>`
      select t, to_regclass(t) is not null as ok
      from unnest(array['users','invoices','business_models','movements','customers']) as t`;
    return { actividad: rows, tablas: Object.fromEntries(tables.map((r) => [r.t, r.ok])) };
  });
}

/**
 * Termina sesiones de la app que quedaron trabadas (transacción abierta o esperando un bloqueo por más de 30 s),
 * típico cuando Vercel corta una función a mitad de una migración. También limita a futuro las transacciones colgadas.
 */
export function releaseStuckSessions() {
  return withProbe(async (sql) => {
    const killed = await sql<{ pid: number }[]>`
      select pid from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid() and usename = current_user
        and (
          (state like 'idle in transaction%' and now() - state_change > interval '30 seconds')
          or (wait_event_type = 'Lock' and now() - query_start > interval '30 seconds')
        )`;
    for (const k of killed) await sql`select pg_terminate_backend(${k.pid})`;
    // Límites para que nada vuelva a quedarse colgado: aplican a las conexiones nuevas del usuario de la app.
    const limits: Record<string, string> = {
      idle_in_transaction_session_timeout: "60s",
      lock_timeout: "10s",
      statement_timeout: "30s",
    };
    const preventivo: Record<string, string> = {};
    for (const [k, v] of Object.entries(limits)) {
      try {
        await sql.unsafe(`alter role current_user set ${k} = '${v}'`);
        preventivo[k] = v;
      } catch (e) {
        preventivo[k] = `no se pudo: ${(e as Error).message}`;
      }
    }
    return { sesiones_liberadas: killed.length, limites: preventivo };
  });
}
