import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { COLUMNS } from "@/lib/batch/build";
import { money, dateTime } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { uploadBatch } from "../actions";

export const metadata = { title: "Facturación masiva" };

export default async function MasivaPage() {
  const user = await requireUser();
  const db = await getDb();
  const batches = await db.select().from(schema.invoiceBatches).orderBy(desc(schema.invoiceBatches.id)).limit(50);
  const canEdit = user.role !== "USUARIO";

  return (
    <>
      <PageHeader title="Facturación masiva" description="Carga un archivo con tus ventas y emítelas en Siigo de una sola vez." />
      {canEdit && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <h2 className="mb-4 font-semibold">1. Sube el archivo</h2>
            <ActionForm action={uploadBatch} className="space-y-4">
              <div>
                <label className="label" htmlFor="name">Nombre del lote (opcional)</label>
                <input id="name" name="name" className="input" placeholder="Ventas octubre" />
              </div>
              <div>
                <label className="label" htmlFor="file">Archivo .xlsx o .csv</label>
                <input id="file" name="file" type="file" accept=".csv,.xlsx" required className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
              </div>
              <div className="flex items-center gap-3">
                <Submit>Validar archivo</Submit>
                <a href="/api/plantilla" className="text-sm text-brand-700 hover:underline">Descargar plantilla</a>
              </div>
              <p className="text-xs text-slate-500">Nada se envía a Siigo hasta que confirmes en el siguiente paso.</p>
            </ActionForm>
          </div>
          <div className="card text-sm">
            <h2 className="mb-3 font-semibold">Columnas del archivo</h2>
            <p className="mb-3 text-slate-500">Una fila por ítem. Las filas con la misma <b>referencia</b> forman una factura.</p>
            <ul className="space-y-1.5">
              {COLUMNS.map((c) => (
                <li key={c.key}>
                  <code className="rounded bg-slate-100 px-1 text-xs">{c.key}</code>
                  {c.required && <span className="text-red-600">*</span>} <span className="text-slate-500">— {c.help}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
