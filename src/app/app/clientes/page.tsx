import { asc, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { PageHeader, Pager } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { syncCustomers } from "../actions";

export const metadata = { title: "Clientes" };
const PAGE = 100;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const user = await requireUser();
  const { q = "", p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.customers)
    .where(q ? or(ilike(schema.customers.name, `%${q}%`), ilike(schema.customers.identification, `%${q}%`)) : undefined)
    .orderBy(asc(schema.customers.name))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Terceros sincronizados desde Siigo. Los clientes nuevos se crean en Siigo y luego se sincronizan aquí."
        actions={user.role !== "USUARIO" && <ActionButton action={syncCustomers} className="btn-primary">Sincronizar desde Siigo</ActionButton>}
      />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Buscar nombre o NIT…" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Identificación</th><th>Nombre</th><th>Correo</th><th>Ciudad</th><th>Sucursal</th><th>Sincronizado</th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE).map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="font-mono text-xs">{c.identification}</td>
                <td>{c.name}</td>
                <td>{c.email ?? "—"}</td>
                <td>{c.city ?? "—"}</td>
                <td>{c.branchOffice}</td>
                <td>{dateTime(c.syncedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Sin clientes. Sincroniza desde Siigo.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE} href={(n) => `/app/clientes?${new URLSearchParams({ q, p: String(n) })}`} />
    </>
  );
}
