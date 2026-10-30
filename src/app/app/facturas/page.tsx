import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { PageHeader, Pager, StatusBadge } from "@/components/ui";
import { ClickableRow, SidePanel } from "@/components/row-and-panel";
import { InvoiceDetail } from "./invoice-detail";

export const metadata = { title: "Facturas" };
const PAGE = 50;

export default async function FacturasPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; p?: string; ver?: string }> }) {
  await requireUser();
  const { q = "", estado = "", p = "1", ver = "" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where: SQL[] = [];
  if (estado) where.push(eq(schema.invoices.status, estado));
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(schema.invoices.reference, like), ilike(schema.invoices.customerIdentification, like), ilike(schema.invoices.customerName, like), ilike(schema.invoices.siigoNumber, like))!);
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.invoices.id))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const href = (n: number, extra: Record<string, string> = {}) => `/app/facturas?${new URLSearchParams({ q, estado, p: String(n), ...extra })}`;

  return (
    <>
      <PageHeader title="Facturas" description="Todas las facturas creadas desde Jero" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Buscar referencia, cliente, número…" />
        <select name="estado" defaultValue={estado} className="input max-w-[180px]">
          <option value="">Todos los estados</option>
          <option value="sent">Emitidas</option>
          <option value="error">Con error</option>
          <option value="pending">Pendientes</option>
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Número</th><th>Ref.</th><th>Fecha</th><th>Cliente</th><th className="text-right">Total</th><th>Estado</th><th>Lote</th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE).map((inv) => (
              <ClickableRow key={inv.id} href={href(page, { ver: String(inv.id) })} selected={ver === String(inv.id)}>
                <td><Link className="text-brand-700 hover:underline" href={href(page, { ver: String(inv.id) })} scroll={false}>{inv.siigoNumber ?? `#${inv.id}`}</Link></td>
                <td className="whitespace-nowrap">{inv.reference}</td>
                <td className="whitespace-nowrap">{inv.date}</td>
                <td>{inv.customerName ?? ""} <span className="text-slate-400">{inv.customerIdentification}</span></td>
                <td className="text-right tabular-nums">{money(inv.total)}</td>
                <td><StatusBadge status={inv.status} /></td>
                <td>{inv.batchId && <Link className="text-slate-500 hover:underline" href={`/app/masiva/${inv.batchId}`}>#{inv.batchId}</Link>}</td>
              </ClickableRow>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE} href={(n) => href(n)} />
      {ver && (
        <SidePanel closeHref={href(page)} title="Factura">
          <InvoiceDetail id={Number(ver)} inPanel />
          <div className="mt-6 text-right">
            <Link href={`/app/facturas/${ver}`} className="text-sm text-brand-700 hover:underline">Abrir en página completa →</Link>
          </div>
        </SidePanel>
      )}
    </>
  );
}
