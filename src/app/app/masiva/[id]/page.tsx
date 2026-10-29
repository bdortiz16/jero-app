import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { money, dateTime } from "@/lib/format";
import { Alert, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { BatchRunner } from "@/components/batch-runner";
import { cancelBatch, retryBatchErrors, startBatch } from "../../actions";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const batch = await db.query.invoiceBatches.findFirst({ where: eq(schema.invoiceBatches.id, id) });
  if (!batch) notFound();
  const invoices = await db.select().from(schema.invoices).where(eq(schema.invoices.batchId, id)).orderBy(asc(schema.invoices.id));
  const canEdit = user.role !== "USUARIO";
  const tax = invoices.reduce((s, i) => s + Number(i.taxTotal), 0);

  return (
    <>
      <PageHeader
        title={batch.name}
        description={`Lote #${batch.id} · ${batch.fileName ?? ""} · creado ${dateTime(batch.createdAt)}`}
        actions={
          canEdit && (
            <>
              {batch.status === "draft" && (
                <>
                  <ActionButton action={cancelBatch.bind(null, id)} confirm="¿Descartar este lote?">Descartar</ActionButton>
                  <ActionButton
                    action={startBatch.bind(null, id)}
                    className="btn-primary"
                    confirm={`Se emitirán ${invoices.length} facturas electrónicas en Siigo por ${money(batch.totalAmount)}. ¿Continuar?`}
                  >
                    Emitir {invoices.length} facturas en Siigo
                  </ActionButton>
                </>
              )}
              {batch.status === "done" && batch.errorCount > 0 && (
                <ActionButton action={retryBatchErrors.bind(null, id)} confirm="Se reintentarán las facturas con error. Si alguna indica 'estado incierto', verifica primero en Siigo que no exista. ¿Continuar?">
                  Reintentar {batch.errorCount} con error
                </ActionButton>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Estado" value={<StatusBadge status={batch.status} />} />
        <Stat label="Facturas" value={`${batch.sentCount} / ${batch.totalCount}`} hint="emitidas / total" />
        <Stat label="Total del lote" value={money(batch.totalAmount)} />
        <Stat label="IVA" value={money(tax)} />
      </div>

      {batch.status === "processing" && canEdit && (
        <div className="mb-6"><BatchRunner batchId={id} total={batch.totalCount} /></div>
      )}

      {batch.rowErrors.length > 0 && (
        <div className="mb-6">
          <Alert kind="warning">
            <div className="mb-2 font-medium">{batch.rowErrors.length} fila(s) del archivo fueron rechazadas y no hacen parte del lote:</div>
            <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5">
              {batch.rowErrors.map((e, i) => (
                <li key={i}>{e.row ? `Fila ${e.row}` : "General"}{e.reference ? ` (${e.reference})` : ""}: {e.message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Ref.</th><th>Fecha</th><th>Cliente</th><th>Ítems</th><th className="text-right">Subtotal</th><th className="text-right">IVA</th><th className="text-right">Total</th><th>Estado</th><th>Factura Siigo</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="whitespace-nowrap"><Link className="text-brand-700 hover:underline" href={`/app/facturas/${inv.id}`}>{inv.reference}</Link></td>
                <td className="whitespace-nowrap">{inv.date}</td>
                <td>{inv.customerName ?? ""} <span className="text-slate-400">{inv.customerIdentification}</span></td>
                <td>{inv.payload.items.length}</td>
                <td className="text-right tabular-nums">{money(inv.subtotal)}</td>
                <td className="text-right tabular-nums">{money(inv.taxTotal)}</td>
                <td className="text-right tabular-nums font-medium">{money(inv.total)}</td>
                <td>
                  <StatusBadge status={inv.status} />
                  {inv.error && <div className="mt-1 max-w-xs text-xs text-red-600">{inv.error}</div>}
                </td>
                <td>{inv.siigoNumber ?? "—"}{inv.stampStatus && <div className="text-xs text-slate-500">DIAN: {inv.stampStatus}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
