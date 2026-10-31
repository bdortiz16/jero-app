import Link from "next/link";
import { requireUser } from "@/lib/session";
import { accountingSummary, retentionsByCustomer, salesByCustomer, unbilledMovements } from "@/lib/reports";
import { activeModel } from "@/lib/movements-emit";
import { DEFAULT_COMMISSION_CONFIG } from "@/lib/batch/commission";
import { bimester, groupBy, INCOME_TAX_RATE, journalEntry, monthLabel, profitEstimate, sumRows } from "@/lib/accounting";
import { money, todayBogota } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Reportes contables" };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const pct = (n: number) => `${(n * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rangos rápidos: este mes, mes anterior, bimestre de IVA actual y año. */
function ranges(today: string) {
  const [y, m] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm - 1, 1)));
  const last = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm, 0)));
  const bm = m % 2 === 0 ? m - 1 : m;
  return [
    { label: "Este mes", desde: first(y, m), hasta: today },
    { label: "Mes anterior", desde: first(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1), hasta: last(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1) },
    { label: "Bimestre IVA", desde: first(y, bm), hasta: last(y, bm + 1) },
    { label: "Este año", desde: `${y}-01-01`, hasta: today },
    { label: "Año anterior", desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` },
  ];
}

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayBogota();
  const desde = isDate(sp.desde) ? sp.desde! : `${today.slice(0, 4)}-01-01`;
  const hasta = isDate(sp.hasta) ? sp.hasta! : today;
  const model = await activeModel();
  const code = model?.cfg.thirdPartyCode ?? DEFAULT_COMMISSION_CONFIG.thirdPartyCode;
  const [rows, retentions, customers, unbilled] = await Promise.all([
    accountingSummary(desde, hasta, code),
    retentionsByCustomer(desde, hasta, code),
    salesByCustomer(desde, hasta),
    unbilledMovements(),
  ]);
  const t = sumRows(rows);
  const profit = profitEstimate(t);
  const byMonth = groupBy(rows, (r) => r.month);
  const byCompany = groupBy(rows, (r) => r.company).sort((a, b) => b.commission - a.commission);
  const byBimester = groupBy(rows, (r) => bimester(r.month).label);
  const journal = journalEntry(t);
  const q = `desde=${desde}&hasta=${hasta}`;

  return (
    <>
      <PageHeader
        title="Reportes contables"
        description="Basado en las facturas emitidas en Siigo desde Jero. Lo recibido para terceros no es ingreso: tu ingreso es la comisión."
        actions={
          <>
            <a className="btn-primary" href={`/api/reportes/excel?${q}`}>Libro de ventas (Excel)</a>
            <a className="btn-secondary" href={`/api/reportes/ventas?${q}`}>CSV</a>
          </>
        }
      />
      <form className="mb-3 flex flex-wrap items-end gap-3">
        <div><label className="label">Desde</label><input type="date" name="desde" defaultValue={desde} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="hasta" defaultValue={hasta} className="input" /></div>
        <button className="btn-secondary">Aplicar</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {ranges(today).map((r) => (
          <Link
            key={r.label}
            href={`/app/reportes?desde=${r.desde}&hasta=${r.hasta}`}
            className={`rounded-full border px-3 py-1 ${r.desde === desde && r.hasta === hasta ? "border-brand-700 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ingreso propio (comisión)" value={money(t.commission)} hint={`${t.count.toLocaleString("es-CO")} facturas · margen ${pct(profit.margin)}`} />
        <Stat label="Recibido para terceros" value={money(t.thirdParty)} hint="Valor dispersado: no es ingreso" />
        <Stat label="IVA generado" value={money(t.tax)} hint="Por pagar a la DIAN" />
        <Stat label="Retenciones que te practicaron" value={money(t.retention)} hint="Anticipo: se resta de tu renta" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card text-sm">
          <h2 className="mb-3 font-semibold">Utilidad estimada</h2>
          <Line k="Ingreso por comisiones" v={money(profit.income)} />
          <Line k={`Impuesto de renta estimado (${pct(INCOME_TAX_RATE)})`} v={`- ${money(profit.incomeTax)}`} />
          <div className="mt-2 border-t border-slate-200 pt-2 text-base font-semibold"><Line k="Utilidad neta estimada" v={money(profit.netProfit)} /></div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <Line k="Renta estimada" v={money(profit.incomeTax)} />
            <Line k="(−) Retenciones que te practicaron" v={`- ${money(t.retention)}`} />
            <div className="font-medium"><Line k="Renta por pagar estimada" v={money(profit.incomeTaxAfterRetention)} /></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">No incluye gastos, costos, ICA ni otros descuentos: con ellos la utilidad y la renta reales son menores. Confírmalo con tu contador.</p>
        </div>

        <div className="card overflow-x-auto p-0">
          <h2 className="px-5 pt-4 font-semibold">IVA por bimestre</h2>
          <p className="px-5 pb-2 text-xs text-slate-500">Para la declaración bimestral de IVA (formulario 300).</p>
          <table className="table">
            <thead><tr><th>Bimestre</th><th className="text-right">Base gravada</th><th className="text-right">IVA generado</th></tr></thead>
            <tbody>
              {byBimester.map((b) => (
                <tr key={b.key}><td>{b.key}</td><td className="text-right tabular-nums">{money(b.commission)}</td><td className="text-right tabular-nums">{money(b.tax)}</td></tr>
              ))}
              {!byBimester.length && <tr><td colSpan={3} className="py-6 text-center text-slate-500">Sin facturas en el periodo.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card text-sm">
          <h2 className="mb-3 font-semibold">Por facturar</h2>
          <div className="text-2xl font-semibold tabular-nums">{money(unbilled.amount)}</div>
          <p className="mt-1 text-slate-500">
            {unbilled.count.toLocaleString("es-CO")} movimientos dispersados aún sin factura
            {unbilled.errors ? ` (${unbilled.errors.toLocaleString("es-CO")} con error)` : ""}.
          </p>
          {unbilled.count > 0 && <Link href="/app/movimientos" className="mt-3 inline-block text-brand-700 hover:underline">Ir a Movimientos →</Link>}
          <p className="mt-4 text-xs text-slate-500">La comisión de estos movimientos todavía no está facturada: si son de este periodo, deben facturarse para no omitir ingresos.</p>
        </div>
      </div>

      <Section title="Por empresa" subtitle="Lo que factura cada empresa (KAUPALOKI bajo contrato de mandato con JERO).">
        <TotalsTable rows={byCompany.map((c) => ({ label: c.key, ...c }))} total={t} />
      </Section>

      <Section title="Por mes">
        <TotalsTable rows={byMonth.map((m) => ({ label: monthLabel(m.key), ...m }))} total={t} />
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div>
              <h2 className="font-semibold">Asiento contable sugerido</h2>
              <p className="pb-2 text-xs text-slate-500">Resumen del periodo con cuentas del PUC. Ajusta las cuentas a tu plan contable.</p>
            </div>
            <a className="btn-secondary shrink-0 text-xs" href={`/api/reportes/ventas?${q}&tipo=asiento`}>CSV</a>
          </div>
          <table className="table">
            <thead><tr><th>Cuenta</th><th>Nombre</th><th className="text-right">Débito</th><th className="text-right">Crédito</th></tr></thead>
            <tbody>
              {journal.map((l) => (
                <tr key={l.account}>
                  <td className="font-mono text-xs">{l.account}</td>
                  <td>{l.name}</td>
                  <td className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                  <td className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={2}>Sumas iguales</td>
                <td className="text-right tabular-nums">{money(journal.reduce((s, l) => s + l.debit, 0))}</td>
                <td className="text-right tabular-nums">{money(journal.reduce((s, l) => s + l.credit, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-0">
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div>
              <h2 className="font-semibold">Retenciones por cliente</h2>
              <p className="pb-2 text-xs text-slate-500">Empresas que te retuvieron: pídeles el certificado de retención para tu declaración de renta.</p>
            </div>
            <a className="btn-secondary shrink-0 text-xs" href={`/api/reportes/ventas?${q}&tipo=retenciones`}>CSV</a>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="table">
              <thead><tr><th>Cliente</th><th className="text-right">Facturas</th><th className="text-right">Base</th><th className="text-right">Retención</th></tr></thead>
              <tbody>
                {retentions.map((r) => (
                  <tr key={r.identification}>
                    <td>{r.name ?? ""} <span className="text-slate-400">{r.identification}</span></td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="text-right tabular-nums">{money(r.base)}</td>
                    <td className="text-right tabular-nums">{money(r.retention)}</td>
                  </tr>
                ))}
                {!retentions.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nadie te practicó retención en el periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Section title="Principales clientes">
        <table className="table">
          <thead><tr><th>Cliente</th><th className="text-right">Facturas</th><th className="text-right">Total facturado</th></tr></thead>
          <tbody>
            {customers.slice(0, 20).map((c) => (
              <tr key={c.identification}>
                <td>{c.name ?? ""} <span className="text-slate-400">{c.identification}</span></td>
                <td className="text-right tabular-nums">{c.count}</td>
                <td className="text-right tabular-nums">{money(c.total)}</td>
              </tr>
            ))}
            {!customers.length && <tr><td colSpan={3} className="py-6 text-center text-slate-500">Sin datos.</td></tr>}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-600">{k}</span>
      <span className="whitespace-nowrap tabular-nums">{v}</span>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card mt-6 overflow-x-auto p-0">
      <h2 className="px-5 pt-4 font-semibold">{title}</h2>
      {subtitle ? <p className="px-5 pb-2 text-xs text-slate-500">{subtitle}</p> : <div className="pb-2" />}
      {children}
    </div>
  );
}

type T = { count: number; thirdParty: number; commission: number; tax: number; retention: number; total: number };

function TotalsTable({ rows, total }: { rows: (T & { label: string })[]; total: T }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th></th><th className="text-right">Facturas</th><th className="text-right">Para terceros</th><th className="text-right">Comisión</th>
          <th className="text-right">IVA</th><th className="text-right">Retención</th><th className="text-right">Total facturado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="font-medium">{r.label}</td>
            <td className="text-right tabular-nums">{r.count.toLocaleString("es-CO")}</td>
            <td className="text-right tabular-nums">{money(r.thirdParty)}</td>
            <td className="text-right tabular-nums">{money(r.commission)}</td>
            <td className="text-right tabular-nums">{money(r.tax)}</td>
            <td className="text-right tabular-nums">{money(r.retention)}</td>
            <td className="text-right tabular-nums">{money(r.total)}</td>
          </tr>
        ))}
        {rows.length > 1 && (
          <tr className="font-semibold">
            <td>Total</td>
            <td className="text-right tabular-nums">{total.count.toLocaleString("es-CO")}</td>
            <td className="text-right tabular-nums">{money(total.thirdParty)}</td>
            <td className="text-right tabular-nums">{money(total.commission)}</td>
            <td className="text-right tabular-nums">{money(total.tax)}</td>
            <td className="text-right tabular-nums">{money(total.retention)}</td>
            <td className="text-right tabular-nums">{money(total.total)}</td>
          </tr>
        )}
        {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Sin facturas en el periodo.</td></tr>}
      </tbody>
    </table>
  );
}
