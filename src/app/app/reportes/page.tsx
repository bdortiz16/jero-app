import { requireUser } from "@/lib/session";
import { salesByCustomer, salesByMonth } from "@/lib/reports";
import { money, todayBogota } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Reportes contables" };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayBogota();
  const desde = isDate(sp.desde) ? sp.desde! : `${today.slice(0, 4)}-01-01`;
  const hasta = isDate(sp.hasta) ? sp.hasta! : today;
  const [months, customers] = await Promise.all([salesByMonth(desde, hasta), salesByCustomer(desde, hasta)]);
  const sum = (k: "subtotal" | "tax" | "retention" | "total" | "count") => months.reduce((s, m) => s + m[k], 0);

  return (
    <>
      <PageHeader
        title="Reportes contables"
        description="Basado en las facturas emitidas en Siigo desde Jero."
        actions={<a className="btn-primary" href={`/api/reportes/ventas?desde=${desde}&hasta=${hasta}`}>Exportar libro de ventas (CSV)</a>}
      />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div><label className="label">Desde</label><input type="date" name="desde" defaultValue={desde} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="hasta" defaultValue={hasta} className="input" /></div>
        <button className="btn-secondary">Aplicar</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ingresos (base)" value={money(sum("subtotal"))} hint={`${sum("count")} facturas`} />
        <Stat label="IVA generado" value={money(sum("tax"))} hint="Para la declaración de IVA" />
        <Stat label="Retenciones practicadas" value={money(sum("retention"))} hint="Anticipos a favor" />
        <Stat label="Total facturado" value={money(sum("total"))} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <h2 className="px-5 py-4 font-semibold">Ventas por mes</h2>
          <table className="table">
            <thead><tr><th>Mes</th><th className="text-right">Facturas</th><th className="text-right">Base</th><th className="text-right">IVA</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td className="text-right tabular-nums">{m.count}</td>
                  <td className="text-right tabular-nums">{money(m.subtotal)}</td>
                  <td className="text-right tabular-nums">{money(m.tax)}</td>
                  <td className="text-right tabular-nums">{money(m.total)}</td>
                </tr>
              ))}
              {months.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Sin ventas en el periodo.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto p-0">
          <h2 className="px-5 py-4 font-semibold">Principales clientes</h2>
          <table className="table">
            <thead><tr><th>Cliente</th><th className="text-right">Facturas</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.identification}>
                  <td>{c.name ?? ""} <span className="text-slate-400">{c.identification}</span></td>
                  <td className="text-right tabular-nums">{c.count}</td>
                  <td className="text-right tabular-nums">{money(c.total)}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
