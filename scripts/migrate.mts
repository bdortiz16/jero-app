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

const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.end();
console.log("Migraciones aplicadas.");
