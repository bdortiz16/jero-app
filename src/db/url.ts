/** Busca la primera variable con valor, por nombre exacto o (para integraciones con prefijo) por sufijo. */
function pick(names: string[], suffixes: string[] = []): string | undefined {
  const env = process.env;
  const usable = (v?: string) => !!v && !/YOUR-PASSWORD|%5BYOUR-PASSWORD%5D/.test(v);
  for (const n of names) if (usable(env[n])) return env[n];
  for (const s of suffixes) {
    const key = Object.keys(env).find((k) => k.endsWith(s) && usable(env[k]));
    if (key) return env[key];
  }
  // Si solo hay una URL con el marcador sin reemplazar, se devuelve para que el diagnóstico lo explique.
  for (const n of names) if (env[n]) return env[n];
  return undefined;
}

/**
 * URL de Postgres: DATABASE_URL, o la que crea la integración Supabase ↔ Vercel (POSTGRES_URL, con o sin prefijo).
 * Quita parámetros que Supabase agrega para su pooler y que el driver no entiende.
 */
export function databaseUrl(kind: "app" | "migrate" = "app"): string | undefined {
  const raw =
    kind === "migrate"
      ? pick(["MIGRATION_DATABASE_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"], ["_POSTGRES_URL_NON_POOLING", "_POSTGRES_URL"])
      : pick(["DATABASE_URL", "POSTGRES_URL"], ["_POSTGRES_URL"]);
  if (!raw) return undefined;
  try {
    const u = new URL(raw.trim());
    for (const p of ["supa", "pgbouncer", "connection_limit"]) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export { pick as pickEnv };
