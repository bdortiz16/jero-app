import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getSiigoCredentials } from "@/lib/settings";
import { siigoMockEnabled } from "@/lib/siigo";
import { rowsOf } from "@/lib/batch/process";
import { money, dateTime, todayBogota } from "@/lib/format";
import { Alert, PageHeader, Stat, StatusBadge } from "@/components/ui";

export default async function Dashboard() {
  const user = await requireUser();
  const db = await getDb();
  const month = todayBogota().slice(0, 7);
  const [stats] = rowsOf<{ sent: number; errors: number; pending: number; total: number; tax: number }>(
    await db.execute(sql`
      select
        count(*) filter (where status = 'sent' and substr(date,1,7) = ${month})::int as sent,
        count(*) filter (where status = 'error')::int as errors,
        count(*) filter (where status in ('pending','processing'))::int as pending,
        coalesce(sum(total) filter (where status = 'sent' and substr(date,1,7) = ${month}), 0)::float8 as total,
        coalesce(sum(tax_total) filter (where status = 'sent' and substr(date,1,7) = ${month}), 0)::float8 as tax
      from invoices`),
  );
  const batches = await db.select().from(schema.invoiceBatches).orderBy(desc(schema.invoiceBatches.id)).limit(5);
  const configured = siigoMockEnabled() || (await getSiigoCredentials()) !== null;

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name?.split(" ")[0] ?? ""}`}
        description="Resumen de tu facturación del mes"
        actions={user.role !== "USUARIO" && <Link href="/app/masiva" className="btn-primary">Nueva facturación masiva</Link>}
      />
      {!configured && (
        <div className="mb-6">
          <Alert kind="warning">
            Siigo aún no está conectado.{" "}
            {user.role === "ADMIN" ? <Link className="underline" href="/app/admin/siigo">Configurar ahora</Link> : "Pide a un administrador que lo configure."}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Facturado este mes" value={money(stats?.total)} />
        <Stat label="IVA generado este mes" value={money(stats?.tax)} />
        <Stat label="Facturas emitidas (mes)" value={stats?.sent ?? 0} />
        <Stat label="Con error / pendientes" value={`${stats?.errors ?? 0} / ${stats?.pending ?? 0}`} />
      </div>
      <div className="card mt-6 p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">Últimos lotes</h2>
          <Link href="/app/masiva" className="text-sm text-brand-600 hover:underline">Ver todos</Link>
        </div>
        <table className="table">
          <thead><tr><th>Lote</th><th>Estado</th><th>Facturas</th><th>Total</th><th>Creado</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td><Link className="text-brand-700 hover:underline" href={`/app/masiva/${b.id}`}>{b.name}</Link></td>
                <td><StatusBadge status={b.status} /></td>
                <td className="tabular-nums">{b.sentCount}/{b.totalCount}{b.errorCount ? <span className="text-red-600"> · {b.errorCount} err</span> : null}</td>
                <td className="tabular-nums">{money(b.totalAmount)}</td>
                <td>{dateTime(b.createdAt)}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Aún no hay lotes.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
