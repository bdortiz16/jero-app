import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { updateUser } from "../../actions";
import { RoleSelect } from "./role-select";

export const metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const db = await getDb();
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.createdAt));
  const pending = users.filter((u) => u.status === "pending").length;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description={`Personas que han iniciado sesión con Google.${pending ? ` ${pending} pendiente(s) de aprobación.` : ""}`}
      />
      <div className="card mb-4 text-sm text-slate-600">
        <b>Administrador:</b> todo, incluida la conexión con Siigo y usuarios. <b>Contador:</b> emite facturas y sincroniza.{" "}
        <b>Consulta:</b> solo ve facturas y reportes.
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-medium">{u.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td><RoleSelect userId={u.id} role={u.role} disabled={u.id === me.id} /></td>
                <td><StatusBadge status={u.status} /></td>
                <td>{dateTime(u.lastLoginAt)}</td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <>
                      {u.status !== "active" && (
                        <ActionButton className="btn-primary py-1" action={updateUser.bind(null, u.id, { status: "active" })}>Aprobar</ActionButton>
                      )}
                      {u.status === "active" && (
                        <ActionButton className="btn-secondary py-1" confirm={`¿Bloquear a ${u.email}?`} action={updateUser.bind(null, u.id, { status: "disabled" })}>Bloquear</ActionButton>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
