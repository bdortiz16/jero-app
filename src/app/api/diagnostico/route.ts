import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { supabaseConfig } from "@/lib/supabase/config";

// Revisa la configuración del despliegue sin revelar valores: solo indica qué falta.
export async function GET() {
  const env = process.env;
  const supa = supabaseConfig();
  const encKey = env.ENCRYPTION_KEY ? Buffer.from(env.ENCRYPTION_KEY, "base64").length : 0;
  const checks: Record<string, string> = {
    SUPABASE_URL: !supa ? "FALTA (SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL)" : /^https:\/\/.+\.supabase\.co\/?$/.test(supa.url) ? "ok" : "no parece una URL de Supabase (https://xxxx.supabase.co)",
    SUPABASE_ANON_KEY: supa ? "ok" : "FALTA (SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    ENCRYPTION_KEY: encKey === 32 ? "ok" : encKey ? "debe ser 32 bytes en base64 (openssl rand -base64 32)" : "FALTA",
    ADMIN_EMAILS: env.ADMIN_EMAILS ? "ok" : "FALTA",
  };
  // Errores típicos con Supabase: conexión directa (solo IPv6) o contraseña con caracteres especiales sin codificar.
  const dbUrl = env.DATABASE_URL;
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
  if (dbHint) checks.base_de_datos = dbHint;
  else try {
    const db = await getDb();
    await db.execute(sql`select 1 from users limit 1`);
    checks.base_de_datos = "ok";
  } catch (e) {
    const msg = String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
    checks.base_de_datos = /relation "users" does not exist/.test(msg)
      ? env.VERCEL
        ? "conecta, pero faltan las tablas: haz Redeploy en Vercel (el despliegue las crea)"
        : "conecta, pero faltan las tablas: corre npm run db:migrate"
      : /Falta la base de datos/.test(msg)
        ? env.VERCEL
          ? "FALTA: agrega DATABASE_URL (Supabase → Connect → Transaction pooler) en Vercel"
          : "FALTA: configura Hyperdrive en wrangler.jsonc o el secreto DATABASE_URL"
        : /Tenant or user not found|password authentication failed/.test(msg)
          ? "usuario o contraseña de la base incorrectos: revisa la contraseña en DATABASE_URL"
          : `error de conexión: ${msg.replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 200)}`;
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  // En Vercel, las variables se asignan por entorno: deben estar marcadas en el entorno de este despliegue.
  const plataforma = env.VERCEL
    ? { proveedor: "Vercel", entorno: env.VERCEL_ENV ?? "?", rama: env.VERCEL_GIT_COMMIT_REF ?? "?" }
    : { proveedor: "Cloudflare/otro" };
  return Response.json({ ok, plataforma, checks }, { status: ok ? 200 : 500 });
}
