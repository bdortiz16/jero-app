/** Nombre de la primera variable con valor, por nombre exacto o (para integraciones con prefijo) por sufijo. */
function pickName(names: string[], suffixes: string[] = []): string | undefined {
  const env = process.env;
  const usable = (v?: string) => !!v && !/YOUR-PASSWORD|%5BYOUR-PASSWORD%5D/.test(v);
  for (const n of names) if (usable(env[n])) return n;
  for (const s of suffixes) {
    const key = Object.keys(env).find((k) => k.endsWith(s) && usable(env[k]));
    if (key) return key;
  }
  // Si solo hay una URL con el marcador sin reemplazar, se devuelve para que el diagnóstico lo explique.
  return names.find((n) => env[n]);
}

function pick(names: string[], suffixes: string[] = []): string | undefined {
  const name = pickName(names, suffixes);
  return name ? process.env[name] : undefined;
}

// La URL que genera la integración Supabase ↔ Vercel es la más confiable (región y usuario exactos), va primero.
const appName = () => {
  const integration = pickName(["POSTGRES_URL"], ["_POSTGRES_URL"]);
  const manual = pickName(["DATABASE_URL"]);
  const placeholder = (n?: string) => !!n && /YOUR-PASSWORD|%5BYOUR-PASSWORD%5D/.test(process.env[n] ?? "");
  return integration && !placeholder(integration) ? integration : manual ?? integration;
};

/** Qué variable y qué servidor se usan (sin la contraseña), para el diagnóstico. */
export function databaseSource(): { variable: string; servidor: string } | null {
  const name = appName();
  if (!name) return null;
  try {
    const u = new URL(process.env[name]!.trim());
    return { variable: name, servidor: `${u.hostname}:${u.port || "5432"} (usuario ${decodeURIComponent(u.username)})` };
  } catch {
    return { variable: name, servidor: "URL mal formada" };
  }
}

/**
 * URL de Postgres: DATABASE_URL, o la que crea la integración Supabase ↔ Vercel (POSTGRES_URL, con o sin prefijo).
 * Quita parámetros que Supabase agrega para su pooler y que el driver no entiende.
 */
export function databaseUrl(kind: "app" | "migrate" = "app"): string | undefined {
  const raw =
    kind === "migrate"
      ? pick(["MIGRATION_DATABASE_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"], ["_POSTGRES_URL_NON_POOLING", "_POSTGRES_URL"])
      : (() => {
          const n = appName();
          return n ? process.env[n] : undefined;
        })();
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
