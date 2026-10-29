import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/ui";

export default async function Pendiente() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.status === "active") redirect("/app");
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="card max-w-md space-y-4 p-8 text-center">
        <Logo className="text-2xl" />
        <h1 className="text-lg font-semibold">Tu cuenta está pendiente de aprobación</h1>
        <p className="text-sm text-slate-600">
          Ingresaste como <b>{session.user.email}</b>. Un administrador de Jero debe aprobar tu acceso.
        </p>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <button className="btn-secondary">Cerrar sesión</button>
        </form>
      </div>
    </div>
  );
}
