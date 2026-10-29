"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { DEV_COOKIE, devLoginEnabled } from "@/lib/auth";

export type AuthState = { error?: string; ok?: string; email?: string } | null;

const messages: [RegExp, string][] = [
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Aún no confirmas tu correo. Revisa tu bandeja de entrada (y spam)."],
  [/user already registered/i, "Ese correo ya tiene cuenta. Inicia sesión o recupera tu contraseña."],
  [/password should be at least/i, "La contraseña debe tener al menos 8 caracteres."],
  [/rate limit|too many/i, "Demasiados intentos. Espera unos minutos e intenta de nuevo."],
  [/should be different/i, "La nueva contraseña debe ser distinta a la anterior."],
];
const translate = (m: string) => messages.find(([re]) => re.test(m))?.[1] ?? m;

async function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signInAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translate(error.message), email };
  } catch (e) {
    return { error: (e as Error).message, email };
  }
  redirect("/app");
}

export async function signUpAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email) return { error: "Escribe tu correo." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", email };
  if (password !== String(fd.get("password2") ?? "")) return { error: "Las contraseñas no coinciden.", email };
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=/app` },
    });
    if (error) return { error: translate(error.message), email };
    // Si en Supabase está desactivada la confirmación de correo, la sesión queda iniciada de una vez.
    if (data.session) redirect("/app");
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: (e as Error).message, email };
  }
  return { ok: `Te enviamos un correo a ${email}. Abre el enlace para confirmar tu cuenta y luego inicia sesión.` };
}

export async function resetAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email").toLowerCase();
  if (!email) return { error: "Escribe tu correo." };
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteUrl()}/auth/callback?next=/cuenta/clave`,
    });
    if (error) return { error: translate(error.message), email };
  } catch (e) {
    return { error: (e as Error).message, email };
  }
  return { ok: `Si ${email} tiene cuenta, te llegará un enlace para crear una nueva contraseña.` };
}

export async function updatePasswordAction(_: AuthState, fd: FormData): Promise<AuthState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== String(fd.get("password2") ?? "")) return { error: "Las contraseñas no coinciden." };
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: translate(error.message) };
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/app");
}

export async function devSignInAction(_: AuthState, fd: FormData): Promise<AuthState> {
  if (!devLoginEnabled) return { error: "No disponible" };
  (await cookies()).set(DEV_COOKIE, field(fd, "email").toLowerCase(), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/app");
}

export async function signOutAction() {
  (await cookies()).delete(DEV_COOKIE);
  try {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  } catch {
    // Sin Supabase configurado no hay sesión que cerrar.
  }
  redirect("/");
}
