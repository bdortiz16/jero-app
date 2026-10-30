import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { signOutAction } from "@/app/login/actions";
import { Logo } from "@/components/ui";

export default async function Pendiente() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/app");
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="card max-w-md space-y-4 p-8 text-center">
        <Logo size={44} />
        <h1 className="text-lg font-semibold">Tu cuenta está pendiente de aprobación</h1>
        <p className="text-sm text-slate-600">
          Ingresaste como <b>{user.email}</b>. Un administrador de Jero debe aprobar tu acceso.
        </p>
        <form action={signOutAction}>
          <button className="btn-secondary">Cerrar sesión</button>
        </form>
      </div>
    </div>
  );
}
