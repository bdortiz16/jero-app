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
  try {
    const db = await getDb();
    await db.execute(sql`select 1 from users limit 1`);
    checks.base_de_datos = "ok";
  } catch (e) {
    const msg = String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
    checks.base_de_datos = /relation "users" does not exist/.test(msg)
      ? "conecta, pero faltan las tablas: corre npm run db:migrate con la URL de Neon"
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
