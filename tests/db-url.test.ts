import { afterEach, describe, expect, it } from "vitest";
import { databaseUrl } from "@/db/url";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("databaseUrl", () => {
  it("ignora DATABASE_URL con [YOUR-PASSWORD] si la integración trae una válida con prefijo", () => {
    process.env.DATABASE_URL = "postgresql://postgres.x:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
    process.env.JERO_POSTGRES_URL = "postgres://postgres.x:secreto@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
    expect(databaseUrl()).toBe("postgres://postgres.x:secreto@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require");
  });
  it("prefiere la URL de la integración sobre DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://a:b@aws-0-us-east-1.pooler.supabase.com:6543/db";
    process.env.JERO_POSTGRES_URL = "postgres://c:d@aws-1-us-east-2.pooler.supabase.com:6543/db";
    expect(databaseUrl()).toBe("postgres://c:d@aws-1-us-east-2.pooler.supabase.com:6543/db");
  });
  it("usa DATABASE_URL si no hay integración", () => {
    for (const k of Object.keys(process.env)) if (k.endsWith("POSTGRES_URL")) delete process.env[k];
    process.env.DATABASE_URL = "postgres://a:b@h.example.com:6543/db";
    expect(databaseUrl()).toBe("postgres://a:b@h.example.com:6543/db");
  });
  it("devuelve la URL con marcador si no hay otra, para que el diagnóstico lo explique", () => {
    delete process.env.POSTGRES_URL;
    process.env.DATABASE_URL = "postgres://a:[YOUR-PASSWORD]@h.example.com:6543/db";
    expect(databaseUrl()).toContain("YOUR-PASSWORD");
  });
});
