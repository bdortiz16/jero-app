import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// MIGRATION_DATABASE_URL: conexión directa (Supabase puerto 5432) si DATABASE_URL es el pooler.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL vacío: la base local (PGlite) se migra sola al arrancar la app.");
  process.exit(0);
}

try {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migraciones aplicadas.");
} catch (e) {
  const err = e as Error & { cause?: Error };
  console.error(`\n⚠️  No se pudieron aplicar las migraciones: ${err.cause?.message ?? err.message}`);
  // En Vercel no bloqueamos el despliegue: la app mostrará qué falta en /api/diagnostico.
  if (process.env.VERCEL) {
    console.error("   El despliegue continúa. Corrige DATABASE_URL y vuelve a desplegar.\n");
    process.exit(0);
  }
  process.exit(1);
}
