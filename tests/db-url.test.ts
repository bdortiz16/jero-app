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
  it("usa DATABASE_URL cuando es válida", () => {
    process.env.DATABASE_URL = "postgres://a:b@h.example.com:6543/db";
    process.env.POSTGRES_URL = "postgres://c:d@otro.example.com:6543/db";
    expect(databaseUrl()).toBe("postgres://a:b@h.example.com:6543/db");
  });
  it("devuelve la URL con marcador si no hay otra, para que el diagnóstico lo explique", () => {
    delete process.env.POSTGRES_URL;
    process.env.DATABASE_URL = "postgres://a:[YOUR-PASSWORD]@h.example.com:6543/db";
    expect(databaseUrl()).toContain("YOUR-PASSWORD");
  });
});
