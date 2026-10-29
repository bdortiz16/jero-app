import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { supabaseServer } from "./supabase/server";
import { supabaseConfig } from "./supabase/config";

export type Role = "ADMIN" | "CONTADOR" | "USUARIO";
export type Status = "pending" | "active" | "disabled";

/** Solo desarrollo: entrar con un correo sin contraseña (DEV_LOGIN=true). */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
export const DEV_COOKIE = "jero-dev-email";

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Correo del usuario autenticado (Supabase Auth), o null. */
export async function getAuthEmail(): Promise<string | null> {
  if (devLoginEnabled) {
    const dev = (await cookies()).get(DEV_COOKIE)?.value;
    if (dev) return dev.toLowerCase();
  }
  if (!supabaseConfig()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user?.email_confirmed_at || data.user?.confirmed_at ? data.user.email!.toLowerCase() : null;
}

/**
 * Usuario de Jero (rol y estado) para el correo autenticado. Se crea al primer ingreso:
 * correos de ADMIN_EMAILS y el primer usuario quedan como administradores; el resto, pendientes.
 */
export async function getSessionUser() {
  const email = await getAuthEmail();
  if (!email) return null;
  const db = await getDb();
  const isAdminEmail = adminEmails().includes(email);
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) {
    if (isAdminEmail && (existing.role !== "ADMIN" || existing.status !== "active")) {
      const [u] = await db
        .update(schema.users)
        .set({ role: "ADMIN", status: "active" })
        .where(eq(schema.users.id, existing.id))
        .returning();
      return u;
    }
    return existing;
  }
  const first = !(await db.query.users.findFirst());
  const requireApproval = process.env.REQUIRE_APPROVAL !== "false";
  const [u] = await db
    .insert(schema.users)
    .values({
      email,
      name: email.split("@")[0],
      role: isAdminEmail || first ? "ADMIN" : "USUARIO",
      status: isAdminEmail || first || !requireApproval ? "active" : "pending",
      lastLoginAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  return u ?? (await db.query.users.findFirst({ where: eq(schema.users.email, email) }))!;
}
