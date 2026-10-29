/**
 * URL de Postgres: DATABASE_URL, o la que crea la integración Supabase ↔ Vercel (POSTGRES_URL).
 * Quita parámetros que Supabase agrega para su pooler y que el driver no entiende.
 */
export function databaseUrl(kind: "app" | "migrate" = "app"): string | undefined {
  const env = process.env;
  const raw =
    kind === "migrate"
      ? env.MIGRATION_DATABASE_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || env.POSTGRES_URL
      : env.DATABASE_URL || env.POSTGRES_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw.trim());
    for (const p of ["supa", "pgbouncer", "connection_limit"]) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return raw.trim();
  }
}
