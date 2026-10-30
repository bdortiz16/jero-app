import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getSiigoDefaults } from "@/lib/settings";
import { getCatalogs } from "@/lib/siigo";
import { activeModel } from "@/lib/movements-emit";
import { commissionFor } from "@/lib/batch/commission";
import { rowsOf } from "@/lib/batch/process";
import { money, round2 } from "@/lib/format";
import { Alert, PageHeader, Pager, Stat } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { emitMovementAction } from "../actions";
import { ImportMovementsForm } from "./import-form";

export const metadata = { title: "Movimientos" };
const PAGE = 100;

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const statusStyle: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  emitiendo: "bg-blue-100 text-blue-800",
  facturado: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; empresa?: string; estado?: string; p?: string }>;
}) {
  const user = await requireUser();
  const { q = "", empresa = "", estado = "", p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const db = await getDb();
  const [defaults, model, catalogs] = await Promise.all([getSiigoDefaults(), activeModel(), getCatalogs()]);
  const ivaPct = catalogs?.taxes.find((t) => t.id === model?.cfg.ivaTaxId)?.percentage ?? 19;
  const canEmit = user.role !== "USUARIO";

  const where: SQL[] = [];
  if (empresa) where.push(eq(schema.movements.company, empresa));
  if (estado) where.push(eq(schema.movements.status, estado));
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(schema.movements.customerName, like), ilike(schema.movements.identificationRaw, like))!);
  }
  const cond = where.length ? and(...where) : undefined;
  const [rows, companies, totals] = await Promise.all([
    db.select().from(schema.movements).where(cond).orderBy(asc(schema.movements.rowNumber), asc(schema.movements.id)).limit(PAGE + 1).offset((page - 1) * PAGE),
    db.selectDistinct({ company: schema.movements.company }).from(schema.movements).orderBy(asc(schema.movements.company)),
    db.execute(sql`select status, count(*)::int as n, coalesce(sum(amount),0)::float8 as total from movements group by status`),
  ]);
  const by = Object.fromEntries(rowsOf<{ status: string; n: number; total: number }>(totals).map((t) => [t.status, t]));
  const href = (n: number, extra: Record<string, string> = {}) =>
    `/app/movimientos?${new URLSearchParams({ q, empresa, estado, p: String(n), ...extra })}`;

  return (
    <>
      <PageHeader
        title="Movimientos"
        description={model ? `Se facturan con el modelo activo: ${model.name} (${model.cfg.defaultPct}% ${model.cfg.ivaIncluded ? "IVA incluido" : "+ IVA"}).` : "Carga el archivo de facturas por emitir y emite cada factura."}
      />
      {!model && <div className="mb-4"><Alert kind="warning">No hay un modelo de negocio activo. <Link className="underline" href="/app/modelos">Créalo aquí</Link> antes de emitir.</Alert></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pendientes por facturar" value={by.pendiente?.n ?? 0} hint={money(by.pendiente?.total ?? 0)} />
        <Stat label="Facturados" value={by.facturado?.n ?? 0} hint={money(by.facturado?.total ?? 0)} />
        <Stat label="Con error" value={by.error?.n ?? 0} hint={by.error ? money(by.error.total) : undefined} />
      </div>

      {canEmit && (
        <div className="card mb-6">
          <h2 className="mb-3 font-semibold">Cargar archivo de movimientos</h2>
          <ImportMovementsForm />
          <p className="mt-2 text-xs text-slate-500">
            Formato "Facturas por emitir": #, Empresa que factura, Cliente (beneficiario), Identificación, # retiros, Desde, Hasta, Valor a facturar.
            Si vuelves a subir el mismo archivo, los movimientos repetidos se ignoran.
          </p>
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Buscar cliente o identificación…" />
        <select name="empresa" defaultValue={empresa} className="input max-w-[200px]">
          <option value="">Todas las empresas</option>
          {companies.map((c) => <option key={c.company} value={c.company}>{c.company}</option>)}
        </select>
        <select name="estado" defaultValue={estado} className="input max-w-[180px]">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="facturado">Facturados</option>
          <option value="error">Con error</option>
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Empresa que factura</th><th>Cliente (beneficiario)</th><th>Identificación</th>
              <th className="text-right"># retiros</th><th>Desde</th><th>Hasta</th><th className="text-right">Valor a facturar</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((m) => {
              const amount = Number(m.amount);
              const commission = model ? commissionFor(amount, model.cfg.defaultPct, model.cfg.roundToPeso) : 0;
              const iva = model && !model.cfg.ivaIncluded ? round2((commission * ivaPct) / 100) : 0;
              const otherCompany = m.company.trim().toLowerCase() !== defaults.issuerCompany.trim().toLowerCase();
              return (
                <tr key={m.id}>
                  <td className="text-slate-400">{m.rowNumber ?? ""}</td>
                  <td>{m.company}</td>
                  <td>{m.customerName}</td>
                  <td className="font-mono text-xs">
                    {m.identificationRaw}
                    {m.checkDigit && <div className="text-slate-400">NIT {m.identification}-{m.checkDigit}</div>}
                  </td>
                  <td className="text-right tabular-nums">{m.withdrawals ?? "—"}</td>
                  <td className="whitespace-nowrap">{fmtDay(m.dateFrom)}</td>
                  <td className="whitespace-nowrap">{fmtDay(m.dateTo)}</td>
                  <td className="text-right font-medium tabular-nums whitespace-nowrap">{money(amount)}</td>
                  <td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[m.status] ?? ""}`}>{m.status}</span>
                    {m.error && <div className="mt-1 max-w-xs text-xs text-red-600">{m.error}</div>}
                    {m.invoiceId && m.status === "facturado" && (
                      <div><Link className="text-xs text-brand-700 hover:underline" href={`/app/facturas/${m.invoiceId}`}>Ver factura</Link></div>
                    )}
                  </td>
                  <td className="text-right">
                    {canEmit && model && (m.status === "pendiente" || m.status === "error") && (
                      otherCompany ? (
                        <span className="text-xs text-slate-400">Factura {m.company}</span>
                      ) : (
                        <ActionButton
                          className="btn-primary py-1 whitespace-nowrap"
                          action={emitMovementAction.bind(null, m.id)}
                          confirm={`Emitir factura a ${m.customerName}:\n• Ingresos de terceros: ${money(amount)}\n• Comisión ${model.cfg.defaultPct}%: ${money(commission)}${iva ? `\n• IVA ${ivaPct}%: ${money(iva)}` : ""}${m.personType === "Company" && model.cfg.retentionTaxId ? "\n• Retefuente sobre la comisión (persona jurídica)" : ""}\n\n¿Continuar?`}
                        >
                          {m.status === "error" ? "Reintentar" : "Emitir factura"}
                        </ActionButton>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-slate-500">No hay movimientos con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE} href={(n) => href(n)} />
    </>
  );
}
