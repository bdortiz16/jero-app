import { asc, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getCatalogs } from "@/lib/siigo";
import { money, dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { syncProducts } from "../actions";

export const metadata = { title: "Productos" };

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.products)
    .where(q ? or(ilike(schema.products.name, `%${q}%`), ilike(schema.products.code, `%${q}%`)) : undefined)
    .orderBy(asc(schema.products.code))
    .limit(500);
  const catalogs = await getCatalogs();
  const taxName = (id: number) => catalogs?.taxes.find((t) => t.id === id)?.name ?? `#${id}`;

  return (
    <>
      <PageHeader
        title="Productos y servicios"
        description="Catálogo sincronizado desde Siigo. Usa estos códigos en la columna producto_codigo."
        actions={user.role !== "USUARIO" && <ActionButton action={syncProducts} className="btn-primary">Sincronizar desde Siigo</ActionButton>}
      />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Buscar código o nombre…" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Código</th><th>Nombre</th><th className="text-right">Precio</th><th>Impuestos</th><th>Sincronizado</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="font-mono text-xs">{p.code}</td>
                <td>{p.name}</td>
                <td className="text-right tabular-nums">{p.price ? money(p.price) : "—"}</td>
                <td className="text-xs">{p.taxIds.map(taxName).join(", ") || "—"}</td>
                <td>{dateTime(p.syncedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Sin productos. Sincroniza desde Siigo.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
