import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireEditor } from "@/lib/session";
import { PageHeader, Stat } from "@/components/ui";
import { ImportWithdrawalsForm } from "./withdrawals-form";

export const metadata = { title: "Pagos a clientes" };

/** Detalle de pagos (retiros) que los clientes consultan en la página pública /pagos. */
export default async function PagosAdminPage() {
  await requireEditor();
  const db = await getDb();
  const [stats] = await db
    .select({
      n: sql<number>`count(*)::int`,
      clientes: sql<number>`count(distinct ${schema.withdrawals.idKey})::int`,
      ultimo: sql<string | null>`max(${schema.withdrawals.paidAt})::text`,
    })
    .from(schema.withdrawals);
  return (
    <>
      <PageHeader
        title="Pagos a clientes"
        description="El detalle de cada pago que los clientes consultan con su cédula o NIT en la página de inicio."
        actions={<Link href="/pagos" target="_blank" className="btn-secondary">Ver la página pública</Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pagos cargados" value={Number(stats?.n ?? 0).toLocaleString("es-CO")} />
        <Stat label="Clientes" value={Number(stats?.clientes ?? 0).toLocaleString("es-CO")} />
        <Stat label="Último pago" value={stats?.ultimo ? new Date(stats.ultimo).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "—"} />
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">Cargar archivo de cruce de retiros</h2>
        <ImportWithdrawalsForm />
        <p className="mt-2 text-xs text-slate-500">
          Hojas JERO y KAUPALOKI con Fecha retiro, Beneficiario, Identificación, Banco y Cuenta destino, Importe neto, Estado y
          Factura. Volver a subirlo actualiza el estado y la factura de cada pago sin duplicarlos.
        </p>
      </div>
    </>
  );
}
