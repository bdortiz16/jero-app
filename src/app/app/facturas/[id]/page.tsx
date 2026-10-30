import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getCatalogs } from "@/lib/siigo";
import { money, dateTime, round2 } from "@/lib/format";
import { Alert, PageHeader, StatusBadge } from "@/components/ui";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
  if (!inv) notFound();
  const catalogs = await getCatalogs();
  const taxName = (tid: number) => catalogs?.taxes.find((t) => t.id === tid)?.name ?? `#${tid}`;
  const paymentName = (pid: number) => catalogs?.paymentTypes.find((t) => t.id === pid)?.name ?? `#${pid}`;
  const p = inv.payload;

  return (
    <>
      <PageHeader
        title={inv.siigoNumber ? `Factura ${inv.siigoNumber}` : `Factura ${inv.reference}`}
        description={`Referencia ${inv.reference} · creada ${dateTime(inv.createdAt)}`}
        actions={
          <>
            {inv.siigoId && <a className="btn-primary" href={`/api/facturas/${inv.id}/pdf`} target="_blank" rel="noopener">Ver PDF de Siigo</a>}
            {inv.siigoId && <a className="btn-secondary" href={`/api/facturas/${inv.id}/pdf?descargar=1`}>Descargar PDF</a>}
            {inv.batchId && <Link href={`/app/masiva/${inv.batchId}`} className="btn-secondary">Ver lote #{inv.batchId}</Link>}
          </>
        }
      />
      {inv.error && <div className="mb-6"><Alert kind={inv.status === "error" ? "error" : "warning"}>{inv.error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-2 text-sm">
          <Row k="Estado" v={<StatusBadge status={inv.status} />} />
          <Row k="Fecha" v={inv.date} />
          <Row k="Cliente" v={`${inv.customerName ?? ""} (${inv.customerIdentification})`} />
          <Row k="Sucursal" v={p.customer.branchOffice} />
          <Row k="Vendedor (ID)" v={p.sellerId} />
          {p.costCenterId && <Row k="Centro de costo" v={p.costCenterId} />}
          <Row k="Estado DIAN" v={inv.stampStatus ?? "—"} />
          {inv.cufe && <Row k="CUFE" v={<span className="break-all font-mono text-xs">{inv.cufe}</span>} />}
          <Row k="Enviada" v={dateTime(inv.sentAt)} />
          {p.observations && <Row k="Observaciones" v={p.observations} />}
        </div>
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table">
            <thead><tr><th>Código</th><th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th>Impuestos</th><th className="text-right">Base</th></tr></thead>
            <tbody>
              {p.items.map((it, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{it.code}</td>
                  <td>{it.description ?? ""}</td>
                  <td className="text-right tabular-nums">{it.quantity}</td>
                  <td className="text-right tabular-nums">{money(it.price)}</td>
                  <td className="text-right tabular-nums">{it.discount ? money(it.discount) : "—"}</td>
                  <td className="text-xs">{it.taxIds.map(taxName).join(", ") || "—"}</td>
                  <td className="text-right tabular-nums">{money(round2(it.quantity * it.price - it.discount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto max-w-xs space-y-1 p-5 text-sm">
            <Row k="Subtotal" v={money(inv.subtotal)} />
            <Row k="Impuestos" v={money(inv.taxTotal)} />
            <Row k="Retenciones" v={`- ${money(inv.retentionTotal)}`} />
            <div className="border-t border-slate-200 pt-1 font-semibold"><Row k="Total a pagar" v={money(inv.total)} /></div>
            {p.payments.map((pm, i) => (
              <div key={i} className="text-xs text-slate-500">Pago: {paymentName(pm.id)} {money(pm.value)}{pm.dueDate ? ` · vence ${pm.dueDate}` : ""}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
