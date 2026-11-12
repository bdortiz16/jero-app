import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { CREDIT_NOTE_STATUS } from "@/lib/credit-note-options";
import { dateTime } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { updateCreditNoteRequest } from "../actions";

export const metadata = { title: "Notas crédito" };

/** Solicitudes de nota crédito que los clientes envían desde la consulta pública de pagos. */
export default async function NotasCreditoPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireUser();
  const { estado = "abiertas" } = await searchParams;
  const T = schema.creditNoteRequests;
  const where: SQL | undefined =
    estado === "abiertas" ? sql`${T.status} in ('pendiente', 'en_revision')` : estado in CREDIT_NOTE_STATUS ? eq(T.status, estado) : undefined;
  const db = await getDb();
  const [rows, counts] = await Promise.all([
    // Sin el PDF (puede pesar): solo si hay archivo.
    db
      .select({
        id: T.id, invoiceId: T.invoiceId, invoiceNumber: T.invoiceNumber, identification: T.identification, beneficiary: T.beneficiary,
        contactName: T.contactName, email: T.email, phone: T.phone, reason: T.reason, detail: T.detail, status: T.status,
        adminNote: T.adminNote, clientMessage: T.clientMessage, creditNoteNumber: T.creditNoteNumber, creditNoteFileName: T.creditNoteFileName,
        creditNoteAt: T.creditNoteAt, createdAt: T.createdAt, updatedAt: T.updatedAt, hasFile: sql<boolean>`${T.creditNoteFile} is not null`,
      })
      .from(T)
      .where(where ? and(where) : undefined)
      .orderBy(desc(T.createdAt))
      .limit(200),
    db.select({ status: T.status, n: sql<number>`count(*)::int` }).from(T).groupBy(T.status),
  ]);
  const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const canEdit = user.role !== "USUARIO";
  const tabs = [
    ["abiertas", `Abiertas (${n("pendiente") + n("en_revision")})`],
    ["pendiente", `Pendientes (${n("pendiente")})`],
    ["en_revision", `En revisión (${n("en_revision")})`],
    ["aprobada", `Emitidas (${n("aprobada")})`],
    ["rechazada", `No proceden (${n("rechazada")})`],
    ["todas", "Todas"],
  ];

  return (
    <>
      <PageHeader
        title="Notas crédito"
        description="Clientes que no están de acuerdo con una factura y pidieron nota crédito desde la consulta de pagos."
        actions={<a className="btn-primary" href={`/api/notas-credito/excel?estado=${estado}`}>Descargar Excel</a>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pendientes" value={n("pendiente")} hint="Sin revisar" />
        <Stat label="En revisión" value={n("en_revision")} />
        <Stat label="Notas crédito emitidas" value={n("aprobada")} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/app/notas-credito?estado=${k}`} className={`rounded-full border px-3 py-1 ${estado === k ? "border-brand-700 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        {rows.map((r) => {
          const st = CREDIT_NOTE_STATUS[r.status] ?? { label: r.status, style: "bg-slate-100" };
          const wa = r.phone ? r.phone.replace(/\D/g, "") : "";
          return (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold">Factura {r.invoiceNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.style}`}>{st.label}</span>
                    {r.invoiceId && <Link href={`/app/facturas?ver=${r.invoiceId}`} className="text-sm text-brand-700 hover:underline">Ver factura</Link>}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {r.beneficiary ?? "—"} · {r.identification} · solicitada {dateTime(r.createdAt)}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">{r.contactName}</div>
                  {r.email && <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Nota crédito factura ${r.invoiceNumber}`)}`} className="text-brand-700 hover:underline">{r.email}</a>}
                  {r.phone && (
                    <div>
                      {r.phone}
                      {wa.length >= 10 && <a href={`https://wa.me/${wa.length === 10 ? `57${wa}` : wa}`} target="_blank" rel="noopener" className="ml-2 text-brand-700 hover:underline">WhatsApp</a>}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <div className="font-medium">{r.reason}</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.detail}</p>
              </div>
              {r.hasFile && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span>
                    <b>Nota crédito {r.creditNoteNumber}</b> adjunta{r.creditNoteAt ? ` el ${dateTime(r.creditNoteAt)}` : ""}: el cliente la ve al consultar sus pagos.
                  </span>
                  <a href={`/api/notas-credito/${r.id}`} target="_blank" rel="noopener" className="font-medium underline">Ver PDF</a>
                </div>
              )}
              {canEdit ? (
                <ActionForm key={`${r.status}-${r.updatedAt.getTime()}`} action={updateCreditNoteRequest} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="id" value={r.id} />
                  <div>
                    <label className="label">Estado</label>
                    <select name="status" defaultValue={r.status} className="input">
                      {Object.entries(CREDIT_NOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">N.º de nota crédito</label>
                    <input name="creditNoteNumber" defaultValue={r.creditNoteNumber ?? ""} className="input" placeholder="Ej. NC-1-25" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label">{r.hasFile ? "Reemplazar PDF de la nota crédito" : "Adjuntar PDF de la nota crédito"}</label>
                    <input name="file" type="file" accept="application/pdf,.pdf" className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Respuesta para el cliente (la ve al consultar)</label>
                    <textarea name="clientMessage" defaultValue={r.clientMessage ?? ""} className="input min-h-[60px]" placeholder="Ej.: Emitimos la nota crédito por el pago del 10 de abril." />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Nota interna (solo el equipo)</label>
                    <textarea name="adminNote" defaultValue={r.adminNote ?? ""} className="input min-h-[60px]" placeholder="Ej.: Revisado con contabilidad, emitida en Siigo el 12/11" />
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
                    <button className="btn-primary">Guardar</button>
                    <span className="text-xs text-slate-500">Al adjuntar el PDF la solicitud pasa a &quot;Nota crédito emitida&quot; y el cliente la puede ver y descargar.</span>
                  </div>
                </ActionForm>
              ) : (
                r.adminNote && <p className="mt-2 text-sm text-slate-600">Nota: {r.adminNote}</p>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className="card py-10 text-center text-sm text-slate-500">No hay solicitudes {estado === "abiertas" ? "abiertas" : "con este estado"}.</div>}
      </div>
    </>
  );
}
