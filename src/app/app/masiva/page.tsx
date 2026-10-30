import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { COLUMNS } from "@/lib/batch/build";
import { money, dateTime } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/ui";
import { DEFAULT_COMMISSION_CONFIG, COMMISSION_COLUMNS, type CommissionModelConfig } from "@/lib/batch/commission";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Facturación masiva" };

export default async function MasivaPage() {
  const user = await requireUser();
  const db = await getDb();
  const batches = await db.select().from(schema.invoiceBatches).orderBy(desc(schema.invoiceBatches.id)).limit(50);
  const canEdit = user.role !== "USUARIO";
  const models = (
    await db.select().from(schema.businessModels).where(eq(schema.businessModels.active, true)).orderBy(asc(schema.businessModels.id))
  ).map((m) => {
    const c = { ...DEFAULT_COMMISSION_CONFIG, ...(m.config as Partial<CommissionModelConfig>) };
    return { id: m.id, name: m.name, defaultPct: c.defaultPct, ivaIncluded: c.ivaIncluded, retention: !!c.retentionTaxId };
  });

  return (
    <>
      <PageHeader title="Facturación masiva" description="Carga un archivo y emite todas las facturas en Siigo de una sola vez." />
      {canEdit && (
        <UploadForm
          models={models}
          standardColumns={COLUMNS.map((c) => ({ ...c }))}
          commissionColumns={COMMISSION_COLUMNS.map((c) => ({ ...c }))}
        />
      )}

      <div className="card mt-6 p-0">
        <h2 className="px-5 py-4 font-semibold">Lotes</h2>
        <table className="table">
          <thead><tr><th>#</th><th>Lote</th><th>Estado</th><th>Emitidas</th><th>Errores</th><th>Total</th><th>Creado</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="text-slate-400">{b.id}</td>
                <td><Link className="text-brand-700 hover:underline" href={`/app/masiva/${b.id}`}>{b.name}</Link></td>
                <td><StatusBadge status={b.status} /></td>
                <td className="tabular-nums">{b.sentCount}/{b.totalCount}</td>
                <td className="tabular-nums">{b.errorCount || "—"}</td>
                <td className="tabular-nums">{money(b.totalAmount)}</td>
                <td>{dateTime(b.createdAt)}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Aún no hay lotes.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
