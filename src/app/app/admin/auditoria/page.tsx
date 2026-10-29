import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Auditoría" };

export default async function AuditoriaPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.id)).limit(300);
  return (
    <>
      <PageHeader title="Auditoría" description="Últimas 300 acciones realizadas en Jero" />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTime(r.createdAt)}</td>
                <td>{r.userEmail ?? "sistema"}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="max-w-md truncate font-mono text-xs text-slate-500">{r.detail ? JSON.stringify(r.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
