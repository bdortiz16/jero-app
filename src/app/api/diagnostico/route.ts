import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { supabaseConfig } from "@/lib/supabase/config";
import { databaseSource, databaseUrl } from "@/db/url";
import { dbActivity, releaseStuckSessions } from "@/lib/db-health";
import { getAuthEmail } from "@/lib/auth";
import { withTimeout } from "@/lib/timeout";
import { recentServerErrors } from "@/lib/error-log";

export const maxDuration = 30;

const timeout = <T,>(p: Promise<T>, ms: number) =>
  withTimeout(p, ms, `sin respuesta en ${ms / 1000}s (posible bloqueo: usa ?liberar=1)`);

// Revisa la configuración del despliegue sin revelar valores: solo indica qué falta.
export async function GET(req: Request) {
  const env = process.env;
  // ?liberar=1 (con sesión iniciada): termina sesiones trabadas en la base.
  if (new URL(req.url).searchParams.get("liberar")) {
    if (!(await getAuthEmail().catch(() => null))) return Response.json({ error: "Inicia sesión en Jero primero" }, { status: 401 });
    try {
      return Response.json(await releaseStuckSessions());
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  const supa = supabaseConfig();
    const encKey = env.ENCRYPTION_KEY?.trim().length ?? 0;
  const checks: Record<string, string> = {
    SUPABASE_URL: !supa ? "FALTA (SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL)" : /^https:\/\/.+\.supabase\.co\/?$/.test(supa.url) ? "ok" : "no parece una URL de Supabase (https://xxxx.supabase.co)",
    SUPABASE_ANON_KEY: supa ? "ok" : "FALTA (SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    ENCRYPTION_KEY: encKey >= 16 ? "ok" : encKey ? "muy corta: usa al menos 16 caracteres" : "pendiente: necesaria solo para guardar las credenciales de Siigo",
  };
  // Errores típicos con Supabase: conexión directa (solo IPv6) o contraseña con caracteres especiales sin codificar.
  const dbUrl = databaseUrl();
  let dbHint: string | null = null;
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      if (!u.hostname.includes(".")) {
        dbHint = "la URL quedó mal formada: si la contraseña tiene símbolos (@ # / ? %) cámbiala en Supabase por una solo con letras y números";
      } else if (/^db\..+\.supabase\.co$/.test(u.hostname)) {
        dbHint = "usas la conexión directa de Supabase (no funciona en Vercel): usa Connect → Transaction pooler (puerto 6543)";
      } else if (u.password.includes("[YOUR-PASSWORD]") || u.password === "%5BYOUR-PASSWORD%5D") {
        dbHint = "reemplaza [YOUR-PASSWORD] por la contraseña real de la base de datos";
      }
    } catch {
      dbHint = "la URL no es válida: si la contraseña tiene símbolos (@ # / ? %) cámbiala en Supabase por una solo con letras y números";
    }
  }
  const tiempos: Record<string, string> = {};
  const t = performance.now();
  if (dbHint) checks.base_de_datos = dbHint;
  else try {
    const db = await timeout(getDb(), 12_000);
    tiempos.conexion_y_migraciones = `${Math.round(performance.now() - t)} ms`;
    const t2 = performance.now();
    await timeout(db.execute(sql`select 1 from users limit 1`), 8_000);
    tiempos.consulta = `${Math.round(performance.now() - t2)} ms`;
    checks.base_de_datos = "ok";
  } catch (e) {
    const msg = String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
    checks.base_de_datos = /relation "users" does not exist/.test(msg)
      ? env.VERCEL
        ? "conecta, pero faltan las tablas: haz Redeploy en Vercel (el despliegue las crea)"
        : "conecta, pero faltan las tablas: corre npm run db:migrate"
      : /Falta la base de datos/.test(msg)
        ? env.VERCEL
          ? "FALTA: en Vercel → Storage conecta Supabase, o agrega DATABASE_URL (Supabase → Connect → Transaction pooler)"
          : "FALTA: configura Hyperdrive en wrangler.jsonc o el secreto DATABASE_URL"
        : /tenant\/user .* not found|Tenant or user not found/i.test(msg)
          ? "el servidor de la URL no corresponde a tu proyecto (región aws-0/aws-1 o us-east-1/us-east-2 equivocada): copia la URL exacta de Supabase → Connect → Direct → Transaction pooler, o usa la integración de Vercel"
          : /password authentication failed/.test(msg)
          ? "contraseña de la base incorrecta: restablécela en Supabase (Database → Settings) y actualiza la URL"
          : `error de conexión: ${msg.replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 200)}`;
  }
  const ok = Object.values(checks).every((v) => v === "ok" || v.startsWith("pendiente"));
  // En Vercel, las variables se asignan por entorno: deben estar marcadas en el entorno de este despliegue.
  const plataforma = env.VERCEL
    ? { proveedor: "Vercel", entorno: env.VERCEL_ENV ?? "?", rama: env.VERCEL_GIT_COMMIT_REF ?? "?" }
    : { proveedor: "Cloudflare/otro" };
  if (supa) {
    const t3 = performance.now();
    try {
      await fetch(`${supa.url}/auth/v1/health`, { headers: { apikey: supa.key }, signal: AbortSignal.timeout(8000) });
      tiempos.supabase_auth = `${Math.round(performance.now() - t3)} ms`;
    } catch (e) {
      tiempos.supabase_auth = `error: ${(e as Error).message}`;
    }
  }
  let base: unknown = null;
  if (!dbHint && databaseUrl()) {
    const t4 = performance.now();
    base = await dbActivity().catch((e) => ({ error: (e as Error).message }));
    tiempos.revision_base = `${Math.round(performance.now() - t4)} ms`;
  }
  // Últimos errores del servidor (solo con sesión iniciada: pueden contener detalles internos).
  const errores = (await getAuthEmail().catch(() => null)) ? await recentServerErrors() : "inicia sesión para verlos";
  return Response.json({ ok, plataforma: { ...plataforma, region: env.VERCEL_REGION ?? "?" }, conexion: databaseSource(), tiempos, checks, base, errores }, { status: ok ? 200 : 500 });
}
