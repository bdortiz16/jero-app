import { redirect } from "next/navigation";
import { getAuthEmail } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { updatePasswordAction } from "@/app/login/actions";

export const metadata = { title: "Nueva contraseña" };

export default async function NuevaClave() {
  const email = await getAuthEmail();
  if (!email) redirect("/login?error=enlace");
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <Logo className="text-2xl" />
          <p className="mt-3 text-sm text-slate-500">Nueva contraseña para <b>{email}</b></p>
        </div>
        <ActionForm action={updatePasswordAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">Nueva contraseña (mínimo 8)</label>
            <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password2">Repítela</label>
            <input id="password2" name="password2" type="password" minLength={8} required autoComplete="new-password" className="input" />
          </div>
          <Submit>Guardar contraseña</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
