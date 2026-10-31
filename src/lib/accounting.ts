/** Cálculos contables a partir del resumen por mes y empresa (sin acceso a la base: se pueden probar). */

export type Totals = { count: number; thirdParty: number; commission: number; tax: number; retention: number; total: number };
type Row = Totals & { month: string; company: string };

/** Tarifa general del impuesto de renta para personas jurídicas en Colombia. */
export const INCOME_TAX_RATE = 0.35;

const zero = (): Totals => ({ count: 0, thirdParty: 0, commission: 0, tax: 0, retention: 0, total: 0 });
const add = (a: Totals, b: Totals): Totals => ({
  count: a.count + b.count,
  thirdParty: a.thirdParty + b.thirdParty,
  commission: a.commission + b.commission,
  tax: a.tax + b.tax,
  retention: a.retention + b.retention,
  total: a.total + b.total,
});

export function sumRows(rows: Totals[]) {
  return rows.reduce(add, zero());
}

export function groupBy(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Totals>();
  for (const r of rows) map.set(key(r), add(map.get(key(r)) ?? zero(), r));
  return [...map.entries()].map(([k, t]) => ({ key: k, ...t }));
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Bimestre de IVA (Ene-Feb, Mar-Abr, …) de un mes AAAA-MM. */
export function bimester(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = m % 2 === 0 ? m - 1 : m;
  return { key: `${y}-${String(Math.ceil(m / 2)).padStart(2, "0")}`, label: `${MONTHS[first - 1]}–${MONTHS[first]} ${y}` };
}

/** Utilidad estimada: la comisión es el ingreso propio; lo de terceros no es ingreso. No incluye gastos. */
export function profitEstimate(t: Totals, rate = INCOME_TAX_RATE) {
  const incomeTax = t.commission * rate;
  return {
    income: t.commission,
    incomeTax,
    netProfit: t.commission - incomeTax,
    incomeTaxAfterRetention: Math.max(incomeTax - t.retention, 0),
    margin: t.thirdParty ? t.commission / t.thirdParty : 0,
  };
}

export type JournalLine = { account: string; name: string; debit: number; credit: number };

/**
 * Asiento resumen sugerido (PUC) de las facturas del periodo:
 * débito clientes y anticipo de retención; crédito ingresos para terceros, comisión e IVA.
 */
export function journalEntry(t: Totals): JournalLine[] {
  return [
    { account: "130505", name: "Clientes nacionales (por cobrar)", debit: t.total, credit: 0 },
    { account: "135515", name: "Retención en la fuente que te practicaron", debit: t.retention, credit: 0 },
    { account: "281505", name: "Ingresos recibidos para terceros (dispersión)", debit: 0, credit: t.thirdParty },
    { account: "4155", name: "Ingresos operacionales – comisiones", debit: 0, credit: t.commission },
    { account: "240805", name: "IVA generado por pagar", debit: 0, credit: t.tax },
  ];
}
