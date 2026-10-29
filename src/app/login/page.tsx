import Link from "next/link";
import { redirect } from "next/navigation";
import { devLoginEnabled, getSessionUser } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";
import { Alert, Logo } from "@/components/ui";
import { AuthForms } from "./auth-forms";

export const metadata = { title: "Iniciar sesión" };

const errors: Record<string, string> = {
  bloqueado: "Tu cuenta fue bloqueada. Contacta al administrador.",
  enlace: "No pudimos abrir el enlace en este navegador. Si estabas confirmando tu correo, ya quedó confirmado: inicia sesión. Si era para cambiar la contraseña, solicita uno nuevo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await getSessionUser().catch(() => null);
  if (user?.status === "active" && !error) redirect("/app");

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="relative card w-full max-w-sm space-y-6 p-8">
        <Link href="/" aria-label="Volver al inicio" className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          ×
        </Link>
        <div className="text-center">
          <Link href="/"><Logo className="text-2xl" /></Link>
          <p className="mt-3 text-sm text-slate-500">Ingresa para gestionar tu facturación</p>
        </div>
        {error && <Alert kind="error">{errors[error] ?? "No fue posible iniciar sesión. Intenta de nuevo."}</Alert>}
        {!supabaseConfig() && !devLoginEnabled && (
          <Alert kind="warning">Falta configurar Supabase (SUPABASE_URL y SUPABASE_ANON_KEY).</Alert>
        )}
        <AuthForms devLogin={devLoginEnabled} />
        <div className="text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 hover:underline">← Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
