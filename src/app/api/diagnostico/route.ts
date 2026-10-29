import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Revisa la configuración del despliegue sin revelar valores: solo indica qué falta.
export async function GET() {
  const env = process.env;
  const secret = env.AUTH_SECRET ?? "";
  const encKey = env.ENCRYPTION_KEY ? Buffer.from(env.ENCRYPTION_KEY, "base64").length : 0;
  const checks: Record<string, string> = {
    AUTH_SECRET: secret.length >= 32 ? "ok" : secret ? "muy corto (usa openssl rand -base64 32)" : "FALTA",
    AUTH_GOOGLE_ID: !env.AUTH_GOOGLE_ID ? "FALTA" : env.AUTH_GOOGLE_ID.endsWith(".apps.googleusercontent.com") ? "ok" : "no parece un Client ID de Google (debe terminar en .apps.googleusercontent.com)",
    AUTH_GOOGLE_SECRET: env.AUTH_GOOGLE_SECRET ? "ok" : "FALTA",
    ENCRYPTION_KEY: encKey === 32 ? "ok" : encKey ? "debe ser 32 bytes en base64 (openssl rand -base64 32)" : "FALTA",
    ADMIN_EMAILS: env.ADMIN_EMAILS ? "ok" : "FALTA",
    AUTH_TRUST_HOST: env.AUTH_TRUST_HOST === "true" ? "ok" : "debe ser true",
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
        ? "FALTA: configura Hyperdrive en wrangler.jsonc o el secreto DATABASE_URL"
        : `error de conexión: ${msg.replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 200)}`;
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
