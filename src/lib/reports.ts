import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rowsOf } from "./batch/process";

export type MonthRow = { month: string; count: number; subtotal: number; tax: number; retention: number; total: number };
export type CustomerRow = { identification: string; name: string | null; count: number; total: number };

/** Libro de ventas: solo facturas emitidas en Siigo. Fechas en formato AAAA-MM-DD. */
export async function salesByMonth(from: string, to: string): Promise<MonthRow[]> {
  const db = await getDb();
  const r = await db.execute(sql`
    select substr(date, 1, 7) as month, count(*)::int as count,
      sum(subtotal)::float8 as subtotal, sum(tax_total)::float8 as tax,
      sum(retention_total)::float8 as retention, sum(total)::float8 as total
    from invoices where status = 'sent' and date between ${from} and ${to}
    group by 1 order by 1`);
  return rowsOf<MonthRow>(r).map((x) => ({ ...x, count: Number(x.count), subtotal: Number(x.subtotal), tax: Number(x.tax), retention: Number(x.retention), total: Number(x.total) }));
}

export async function salesByCustomer(from: string, to: string): Promise<CustomerRow[]> {
  const db = await getDb();
  const r = await db.execute(sql`
    select customer_identification as identification, max(customer_name) as name,
      count(*)::int as count, sum(total)::float8 as total
    from invoices where status = 'sent' and date between ${from} and ${to}
    group by 1 order by total desc limit 50`);
  return rowsOf<CustomerRow>(r).map((x) => ({ ...x, count: Number(x.count), total: Number(x.total) }));
}

export async function salesLedger(from: string, to: string) {
  const db = await getDb();
  const r = await db.execute(sql`
    select date, siigo_number, reference, customer_identification, customer_name,
      subtotal, tax_total, retention_total, total, stamp_status, cufe
    from invoices where status = 'sent' and date between ${from} and ${to}
    order by date, id`);
  return rowsOf<Record<string, string | null>>(r);
}
