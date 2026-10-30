import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCatalogs } from "@/lib/siigo";
import { activeModel } from "@/lib/movements-emit";
import { commissionFor } from "@/lib/batch/commission";
import { money, round2, dateTime } from "@/lib/format";
import { Alert, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { SummaryTable } from "@/components/modal";
import { emitMovementAction } from "../actions";

const day = (d: Date | null) =>
  d ? d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) : "—";

const statusStyle: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  emitiendo: "bg-blue-100 text-blue-800",
  facturado: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

/** Detalle de un movimiento con su facturación. Se usa en la página propia y en el panel lateral de la lista. */
export async function MovementDetail({ id, role, inPanel = false }: { id: number; role: string; inPanel?: boolean }) {
  const user = { role };
  const db = await getDb();
  const m = Number.isInteger(id) ? await db.query.movements.findFirst({ where: eq(schema.movements.id, id) }) : null;
  if (!m) return <Alert kind="error">El movimiento no existe.</Alert>;
  const [inv, model, catalogs] = await Promise.all([
    m.invoiceId ? db.query.invoices.findFirst({ where: eq(schema.invoices.id, m.invoiceId) }) : null,
    activeModel(),
    getCatalogs(),
  ]);
  const taxName = (tid: number) => catalogs?.taxes.find((t) => t.id === tid)?.name ?? `#${tid}`;
  const amount = Number(m.amount);
  const canEmit = user.role !== "USUARIO" && model && (m.status === "pendiente" || m.status === "error");

  // Vista previa con el modelo activo (si aún no se ha facturado)
  const ivaPct = catalogs?.taxes.find((t) => t.id === model?.cfg.ivaTaxId)?.percentage ?? 19;
  const retTax = catalogs?.taxes.find((t) => t.id === model?.cfg.retentionTaxId);
  const commission = model ? commissionFor(amount, model.cfg.defaultPct, model.cfg.roundToPeso) : 0;
  const iva = model && !model.cfg.ivaIncluded ? round2((commission * ivaPct) / 100) : 0;
  const ret = m.personType === "Company" && retTax ? round2((commission * Number(retTax.percentage)) / 100) : 0;

  return (
    <>
      {!inPanel && <div className="mb-2 text-sm"><Link href="/app/movimientos" className="text-brand-700 hover:underline">← Movimientos</Link></div>}
      <PageHeader
        title={m.customerName}
        description={`Movimiento ${m.rowNumber ?? m.id} · ${m.company}`}
        actions={<span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusStyle[m.status] ?? ""}`}>{m.status}</span>}
      />

      <div className={inPanel ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        <div className="card">
          <h2 className="mb-4 font-semibold">Movimiento</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Empresa que factura</dt><dd>{m.company}</dd>
            <dt className="text-slate-500">Cliente (beneficiario)</dt><dd>{m.customerName}</dd>
            <dt className="text-slate-500">Identificación</dt>
            <dd className="font-mono">{m.identificationRaw}{m.checkDigit && <span className="ml-2 text-slate-400">NIT {m.identification}-{m.checkDigit}</span>}</dd>
            <dt className="text-slate-500">Tipo</dt><dd>{m.personType === "Company" ? "Persona jurídica" : "Persona natural"}</dd>
            <dt className="text-slate-500"># retiros</dt><dd>{m.withdrawals ?? "—"}</dd>
            <dt className="text-slate-500">Desde</dt><dd>{day(m.dateFrom)}</dd>
            <dt className="text-slate-500">Hasta</dt><dd>{day(m.dateTo)}</dd>
            <dt className="text-slate-500">Valor a facturar</dt><dd className="font-semibold">{money(amount)}</dd>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold">Facturación</h2>
          {m.error && m.status === "error" && <div className="mb-4"><Alert kind="error">{m.error}</Alert></div>}

          {inv?.siigoId ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs text-emerald-800">Factura en Siigo</div>
                <div className="text-2xl font-semibold text-emerald-900">{inv.siigoNumber}</div>
                <div className="mt-1 text-xs text-emerald-800">Emitida {dateTime(inv.sentAt)} · DIAN: {inv.stampStatus ?? "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-primary" href={`/api/facturas/${inv.id}/pdf`} target="_blank" rel="noopener">Ver factura (PDF)</a>
                <a className="btn-secondary" href={`/api/facturas/${inv.id}/pdf?descargar=1`}>Descargar PDF</a>
                <Link className="btn-secondary" href={`/app/facturas/${inv.id}`}>Detalle en Jero</Link>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-slate-500">Código Siigo</dt><dd className="font-mono text-xs break-all">{inv.siigoId}</dd>
                {inv.cufe && (<><dt className="text-slate-500">CUFE</dt><dd className="font-mono text-xs break-all">{inv.cufe}</dd></>)}
                <dt className="text-slate-500">Fecha factura</dt><dd>{inv.date}</dd>
                {inv.payload.observations && (<><dt className="text-slate-500">Observaciones</dt><dd>{inv.payload.observations}</dd></>)}
              </dl>
              <table className="table">
                <thead><tr><th>Ítem</th><th>Impuestos</th><th className="text-right">Valor</th></tr></thead>
                <tbody>
                  {inv.payload.items.map((it, i) => (
                    <tr key={i}>
                      <td><span className="font-mono text-xs text-slate-500">{it.code}</span> {it.description}</td>
                      <td className="text-xs">{it.taxIds.map(taxName).join(", ") || "—"}</td>
                      <td className="text-right tabular-nums">{money(it.quantity * it.price - it.discount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SummaryTable
                rows={[["Subtotal", money(inv.subtotal)], ["IVA", money(inv.taxTotal)], ["Retenciones", `− ${money(inv.retentionTotal)}`]]}
                total={["Total a pagar", money(inv.total)]}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {model ? (
                <>
                  <p className="text-sm text-slate-500">Aún no tiene factura. Así quedaría con el modelo activo ({model.name}):</p>
                  <SummaryTable
                    rows={[
                      ["Operación recibida para terceros (02)", money(amount)],
                      [`Comisión ${model.cfg.defaultPct}% (01)`, money(commission)],
                      [`IVA ${ivaPct}%`, money(iva)],
                      ...(ret ? ([[retTax!.name, `− ${money(ret)}`]] as [string, string][]) : []),
                    ]}
                    total={["Total a pagar", money(round2(amount + commission + iva - ret))]}
                  />
                </>
              ) : (
                <Alert kind="warning">No hay un modelo de negocio activo.</Alert>
              )}
              {canEmit && (
                <ActionButton
                  className="btn-primary"
                  action={emitMovementAction.bind(null, m.id, {})}
                  confirmTitle="Emitir factura en Siigo"
                  confirmLabel="Emitir factura"
                  confirm={`Se creará en Siigo la factura de ${m.customerName} por ${money(round2(amount + commission + iva - ret))} y se enviará a la DIAN.`}
                >
                  {m.status === "error" ? "Reintentar emisión" : "Emitir factura"}
                </ActionButton>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
