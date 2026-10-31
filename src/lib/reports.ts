import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rowsOf } from "./batch/process";

export type CustomerRow = { identification: string; name: string | null; count: number; total: number };

export async function salesByCustomer(from: string, to: string): Promise<CustomerRow[]> {
  const db = await getDb();
  const r = await db.execute(sql`
    select customer_identification as identification, max(customer_name) as name,
      count(*)::int as count, sum(total)::float8 as total
    from invoices where status = 'sent' and date between ${from} and ${to}
    group by 1 order by total desc limit 50`);
  return rowsOf<CustomerRow>(r).map((x) => ({ ...x, count: Number(x.count), total: Number(x.total) }));
}


/** Valor del ítem de "Operación recibida para terceros" de cada factura (no es ingreso propio). */
const thirdPartyOf = (code: string) => sql`coalesce((
  select sum((it->>'quantity')::numeric * (it->>'price')::numeric - coalesce(nullif(it->>'discount', '')::numeric, 0))
  from jsonb_array_elements(i.payload->'items') it
  where it->>'code' = ${code} or it->>'description' ilike 'Operación recibida para terceros%'
), 0)`;

export type AccountingRow = {
  month: string;
  company: string;
  count: number;
  thirdParty: number;
  commission: number;
  tax: number;
  retention: number;
  total: number;
};

/**
 * Resumen contable por mes y empresa: separa lo recibido para terceros (pasivo, no es ingreso)
 * de la comisión (ingreso propio), con el IVA y la retención que practicaron los clientes.
 */
export async function accountingSummary(from: string, to: string, thirdPartyCode: string): Promise<AccountingRow[]> {
  const db = await getDb();
  const r = await db.execute(sql`
    with base as (
      select substr(i.date, 1, 7) as month,
        coalesce(m.company, 'Facturación masiva') as company,
        i.subtotal, i.tax_total, i.retention_total, i.total,
        ${thirdPartyOf(thirdPartyCode)} as third_party
      from invoices i left join movements m on m.invoice_id = i.id
      where i.status = 'sent' and i.date between ${from} and ${to}
    )
    select month, company, count(*)::int as count,
      sum(third_party)::float8 as third_party,
      sum(subtotal - third_party)::float8 as commission,
      sum(tax_total)::float8 as tax, sum(retention_total)::float8 as retention, sum(total)::float8 as total
    from base group by 1, 2 order by 1, 2`);
  return rowsOf<Record<string, unknown>>(r).map((x) => ({
    month: String(x.month),
    company: String(x.company),
    count: Number(x.count),
    thirdParty: Number(x.third_party),
    commission: Number(x.commission),
    tax: Number(x.tax),
    retention: Number(x.retention),
    total: Number(x.total),
  }));
}

export type RetentionRow = { identification: string; name: string | null; count: number; base: number; retention: number };

/** Clientes que practicaron retención en la fuente (a quienes pedir el certificado). */
export async function retentionsByCustomer(from: string, to: string, thirdPartyCode: string): Promise<RetentionRow[]> {
  const db = await getDb();
  const r = await db.execute(sql`
    select i.customer_identification as identification, max(i.customer_name) as name, count(*)::int as count,
      sum(i.subtotal - ${thirdPartyOf(thirdPartyCode)})::float8 as base, sum(i.retention_total)::float8 as retention
    from invoices i
    where i.status = 'sent' and i.date between ${from} and ${to} and i.retention_total > 0
    group by 1 order by retention desc`);
  return rowsOf<Record<string, unknown>>(r).map((x) => ({
    identification: String(x.identification),
    name: (x.name as string | null) ?? null,
    count: Number(x.count),
    base: Number(x.base),
    retention: Number(x.retention),
  }));
}

/** Movimientos aún sin factura (ingreso por comisión todavía no facturado). */
export async function unbilledMovements() {
  const db = await getDb();
  const r = await db.execute(sql`
    select status, count(*)::int as count, coalesce(sum(amount), 0)::float8 as amount
    from movements where status in ('pendiente', 'error', 'emitiendo') group by 1`);
  const rows = rowsOf<{ status: string; count: number; amount: number }>(r);
  return {
    count: rows.reduce((s, x) => s + Number(x.count), 0),
    amount: rows.reduce((s, x) => s + Number(x.amount), 0),
    errors: Number(rows.find((x) => x.status === "error")?.count ?? 0),
  };
}

/** Libro de ventas detallado (una fila por factura) con la separación terceros / comisión. */
export async function salesLedgerDetailed(from: string, to: string, thirdPartyCode: string) {
  const db = await getDb();
  const r = await db.execute(sql`
    select i.date, i.siigo_number, i.reference, coalesce(m.company, '') as company,
      i.customer_identification, i.customer_name,
      ${thirdPartyOf(thirdPartyCode)}::float8 as third_party,
      (i.subtotal - ${thirdPartyOf(thirdPartyCode)})::float8 as commission,
      i.tax_total, i.retention_total, i.total, i.stamp_status, i.cufe
    from invoices i left join movements m on m.invoice_id = i.id
    where i.status = 'sent' and i.date between ${from} and ${to}
    order by i.date, i.id`);
  return rowsOf<Record<string, string | number | null>>(r);
}
