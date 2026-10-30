import Link from "next/link";
import { and, asc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { companyAllowed, getSiigoDefaults, noteForCompany } from "@/lib/settings";
import { getCatalogs, resolveDocumentId, resolveSellerId } from "@/lib/siigo";
import { activeModel } from "@/lib/movements-emit";
import { previewCommissionInvoice } from "@/lib/batch/commission";
import { rowsOf } from "@/lib/batch/process";
import { movementOrder, movementWhere } from "@/lib/movement-filters";
import { money, round2 } from "@/lib/format";
import { Alert, PageHeader, Pager, Stat } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { SummaryTable } from "@/components/modal";
import { emitMovementAction } from "../actions";
import { ImportMovementsForm } from "./import-form";
import { BulkEmit } from "./bulk-emit";
import { ClickableRow, SidePanel } from "./row-and-panel";
import { MovementDetail } from "./movement-detail";

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
  searchParams: Promise<{ q?: string; empresa?: string; estado?: string; p?: string; min?: string; max?: string; orden?: string; ver?: string }>;
}) {
  const user = await requireUser();
  const { q = "", empresa = "", estado = "", p = "1", min = "", max = "", orden = "", ver = "" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const db = await getDb();
  const [defaults, model, catalogs] = await Promise.all([getSiigoDefaults(), activeModel(), getCatalogs()]);
  const ivaPct = catalogs?.taxes.find((t) => t.id === model?.cfg.ivaTaxId)?.percentage ?? 19;
  const retTax = catalogs?.taxes.find((t) => t.id === model?.cfg.retentionTaxId);
  const canEmit = user.role !== "USUARIO";

  const where = movementWhere({ q, empresa, estado, min, max });
  const cond = where.length ? and(...where) : undefined;
  const [rows, companies, totals] = await Promise.all([
    db.select().from(schema.movements).where(cond).orderBy(...movementOrder(orden)).limit(PAGE + 1).offset((page - 1) * PAGE),
    db.selectDistinct({ company: schema.movements.company }).from(schema.movements).orderBy(asc(schema.movements.company)),
    db.execute(sql`select status, count(*)::int as n, coalesce(sum(amount),0)::float8 as total from movements group by status`),
  ]);
  const by = Object.fromEntries(rowsOf<{ status: string; n: number; total: number }>(totals).map((t) => [t.status, t]));
  const href = (n: number, extra: Record<string, string> = {}) =>
    `/app/movimientos?${new URLSearchParams({ q, empresa, estado, min, max, orden, p: String(n), ...extra })}`;

  return (
    <>
      <PageHeader
        title="Movimientos"
        description={model ? `Se facturan con el modelo activo: ${model.name} (${model.cfg.defaultPct}% ${model.cfg.ivaIncluded ? "IVA incluido" : "+ IVA"}).` : "Carga el archivo de facturas por emitir y emite cada factura."}
      />
      {model && (!resolveDocumentId(defaults, catalogs) || !resolveSellerId(defaults, catalogs)) && (
        <div className="mb-4">
          <Alert kind="warning">
            Falta {!resolveDocumentId(defaults, catalogs) ? <>el <b>Tipo de comprobante</b></> : <>el <b>Vendedor</b></>} antes de emitir.{" "}
            <Link className="underline" href="/app/admin/siigo">Ir a Conexión Siigo → Valores por defecto</Link>, elígelo y pulsa Guardar valores.
          </Alert>
        </div>
      )}
      {model && !model.cfg.retentionTaxId && (
        <div className="mb-4">
          <Alert kind="warning">
            El modelo activo <b>no tiene retención configurada</b>: a las personas jurídicas no se les aplicará Retefuente.{" "}
            <Link className="underline" href={`/app/modelos?editar=${model.id}`}>Configurar retención en el modelo</Link>.
          </Alert>
        </div>
      )}
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

      {canEmit && model && <BulkEmit filters={{ q, empresa, min, max, orden }} />}

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
        <select name="orden" defaultValue={orden} className="input max-w-[190px]" aria-label="Ordenar">
          <option value="">Orden del archivo</option>
          <option value="menor">Menor valor primero</option>
          <option value="mayor">Mayor valor primero</option>
        </select>
        <input name="min" defaultValue={min} inputMode="numeric" className="input max-w-[150px]" placeholder="Valor desde" aria-label="Valor desde" />
        <input name="max" defaultValue={max} inputMode="numeric" className="input max-w-[150px]" placeholder="Valor hasta" aria-label="Valor hasta" />
        <button className="btn-secondary">Filtrar</button>
        {(q || empresa || estado || min || max || orden) && <Link href="/app/movimientos" className="btn-secondary">Limpiar</Link>}
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
              const applyRet = m.personType === "Company" && retTax;
              const pv = model ? previewCommissionInvoice(amount, model.cfg, ivaPct, applyRet ? Number(retTax.percentage) : null) : null;
              const otherCompany = !companyAllowed(m.company, defaults.issuerCompanies);
              return (
                <ClickableRow key={m.id} href={href(page, { ver: String(m.id) })} selected={ver === String(m.id)}>
                  <td className="text-slate-400">{m.rowNumber ?? ""}</td>
                  <td>{m.company}</td>
                  <td><Link href={href(page, { ver: String(m.id) })} scroll={false} className="text-brand-700 hover:underline">{m.customerName}</Link></td>
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
                      <div><Link className="text-xs text-brand-700 hover:underline" href={href(page, { ver: String(m.id) })} scroll={false}>Ver factura</Link></div>
                    )}
                  </td>
                  <td className="text-right">
                    {canEmit && model && (m.status === "pendiente" || m.status === "error") && (
                      otherCompany ? (
                        <span className="text-xs text-slate-400">Factura {m.company}</span>
                      ) : (
                        <ActionButton
                          className="btn-primary py-1 whitespace-nowrap"
                          action={emitMovementAction.bind(null, m.id, {})}
                          confirmTitle="Emitir factura en Siigo"
                          confirmLabel="Emitir factura"
                          confirm={<EmitSummary m={m} amount={amount} pv={pv!} ivaPct={ivaPct} pct={model.cfg.defaultPct} ivaIncluded={model.cfg.ivaIncluded} retentionName={applyRet ? retTax.name : null} retentionMissing={m.personType === "Company" && !retTax} note={noteForCompany(m.company, defaults.companyNotes)} />}
                        >
                          {m.status === "error" ? "Reintentar" : "Emitir factura"}
                        </ActionButton>
                      )
                    )}
                  </td>
                </ClickableRow>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-slate-500">No hay movimientos con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE} href={(n) => href(n)} />
      {ver && (
        <SidePanel closeHref={href(page)} title="Movimiento">
          <MovementDetail id={Number(ver)} role={user.role} inPanel />
          <div className="mt-4 text-right">
            <Link href={`/app/movimientos/${ver}`} className="text-sm text-brand-700 hover:underline">Abrir en página completa →</Link>
          </div>
        </SidePanel>
      )}
    </>
  );
}

function EmitSummary({
  m,
  amount,
  pv,
  ivaPct,
  pct,
  ivaIncluded,
  retentionName,
  retentionMissing,
  note,
}: {
  m: { customerName: string; identificationRaw: string; company: string; personType: string };
  amount: number;
  pv: { commission: number; base: number; iva: number; retention: number; total: number };
  ivaPct: number;
  pct: number;
  ivaIncluded: boolean;
  retentionName: string | null;
  retentionMissing: boolean;
  note?: string | null;
}) {
  const rows: [string, string][] = [
    ["Operación recibida para terceros (02)", money(amount)],
    [`Comisión ${pct}% (01) · base sin IVA`, money(pv.base)],
    [`IVA ${ivaPct}% de la comisión`, money(pv.iva)],
    ...(retentionName ? ([[`${retentionName} (sobre ${money(pv.base)})`, `− ${money(pv.retention)}`]] as [string, string][]) : []),
  ];
  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium text-slate-900">{m.customerName}</div>
        <div className="text-xs text-slate-500">
          {m.identificationRaw} · {m.personType === "Company" ? "Persona jurídica" : "Persona natural"} · {m.company}
        </div>
      </div>
      {ivaIncluded && <p className="text-xs text-slate-500">Comisión con IVA incluido: {money(pv.commission)} = base {money(pv.base)} + IVA {money(pv.iva)}.</p>}
      <SummaryTable rows={rows} total={["Total a pagar", money(pv.total)]} />
      {retentionMissing && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Este cliente es persona jurídica, pero el modelo activo no tiene retención configurada (Modelos de negocio → Editar → Retención).
        </p>
      )}
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <b>Descripción:</b> Operación recibida para terceros - {m.customerName}
        {note && <><br /><b>Observaciones:</b> {note}</>}
      </p>
      <p className="text-xs text-slate-500">La factura se crea en Siigo y se envía a la DIAN. Esta acción no se puede deshacer desde Jero.</p>
    </div>
  );
}
