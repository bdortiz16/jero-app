import "server-only";
import { and, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { lookupKeys, parseDocInput, type DocInput } from "./withdrawals";

/** Un pago (o la parte de un pago) dentro de una factura. */
export type PaymentRow = {
  paidAt: string;
  company: string;
  bank: string | null;
  amount: number;
  /** Valor completo del pago, cuando en esta factura solo entra una parte. */
  full: number | null;
  /** Factura(s) anteriores donde quedó el pago (solo en el grupo "anterior"). */
  invoices: string | null;
};

/** Pagos agrupados por la factura en la que quedaron. */
export type InvoiceGroup = {
  key: string;
  /** "jero": factura emitida desde Jero (se puede ver el PDF); "anterior": facturas emitidas antes (todas juntas); "pendiente": aún sin factura. */
  kind: "jero" | "anterior" | "pendiente";
  number: string | null;
  date: string | null;
  invoiceId: number | null;
  invoiceTotal: number | null;
  total: number;
  payments: PaymentRow[];
};

/** Resumen por periodo (de los movimientos "Facturas por emitir"), cuando no hay detalle de retiros cargado. */
export type PeriodRow = {
  company: string;
  beneficiary: string;
  identification: string;
  from: string | null;
  to: string | null;
  withdrawals: number | null;
  amount: number;
  invoice: string | null;
  invoiceId: number | null;
};

const digitsOf = (col: AnyColumn) => sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;

/**
 * El documento escrito coincide con el guardado aunque uno traiga el dígito de verificación y el otro
 * no, o tenga puntos o guion. Quitarle el DV a lo que escribió el cliente solo vale para empresas (o
 * si escribió el guion): así una cédula de 10 dígitos no trae los pagos de otro documento de 9.
 */
function docMatches(p: DocInput, key: AnyColumn, raw: AnyColumn, isCompany: SQL): SQL {
  return or(
    eq(key, p.full),
    sql`${digitsOf(raw)} = ${p.full}`,
    // Guardado con DV pegado y el cliente lo escribió sin DV.
    and(sql`${digitsOf(raw)} like ${p.full + "_"}`, isCompany),
    ...(p.base ? [and(eq(key, p.base), p.explicitNit ? sql`true` : isCompany)] : []),
  )!;
}

// Límites para que nadie recorra documentos al azar: por IP y por documento, en la última hora.
const MAX_PER_IP = 30;
const MAX_FAILED_PER_DOC = 5;

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : null);

/**
 * Consulta pública de pagos con solo la cédula o el NIT (decisión del negocio: los clientes no
 * tienen otro dato a mano). Para que nadie recorra documentos al azar hay límite de consultas por
 * IP, y de la cuenta destino no se muestra ningún dígito, solo el banco.
 */
export async function lookupPayments(doc: string, ip: string): Promise<
  | { ok: true; beneficiary: string; identification: string; count: number; total: number; groups: InvoiceGroup[]; periods: PeriodRow[] }
  | { ok: false; error: string }
> {
  const parsed = parseDocInput(doc);
  if (!parsed) return { ok: false, error: "Escribe tu cédula o NIT (de 5 a 15 números)." };
  const keys = [parsed.full, ...(parsed.base ? [parsed.base] : [])];

  const db = await getDb();
  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ byIp }] = await db
    .select({ byIp: sql<number>`count(*)::int` })
    .from(schema.paymentLookups)
    .where(and(eq(schema.paymentLookups.ip, ip), gte(schema.paymentLookups.createdAt, hourAgo)));
  const [{ failed }] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(schema.paymentLookups)
    .where(and(inArray(schema.paymentLookups.idKey, keys), eq(schema.paymentLookups.ok, false), gte(schema.paymentLookups.createdAt, hourAgo)));
  if (Number(byIp) >= MAX_PER_IP || Number(failed) >= MAX_FAILED_PER_DOC) {
    return { ok: false, error: "Demasiados intentos. Espera una hora y vuelve a intentarlo." };
  }

  const W = schema.withdrawals;
  const all = await db
    .select()
    .from(W)
    .where(docMatches(parsed, W.idKey, W.identificationRaw, sql`(${W.idType} ilike '%nit%' or length(${digitsOf(W.identificationRaw)}) > length(${W.idKey}))`))
    .orderBy(W.paidAt);
  const M = schema.movements;
  const movementMatch = docMatches(parsed, M.identification, M.identificationRaw, sql`${M.personType} = 'Company'`);
  // Sin el detalle de retiros cargado (o sin retiros de ese documento), se muestra al menos lo que
  // hay en Movimientos: cada periodo con su número de retiros, el valor y la factura.
  const periods = all.length
    ? []
    : await db
        .select({ m: schema.movements, number: schema.invoices.siigoNumber, invoiceId: schema.invoices.id, invStatus: schema.invoices.status })
        .from(schema.movements)
        .leftJoin(schema.invoices, eq(schema.invoices.id, schema.movements.invoiceId))
        .where(movementMatch)
        .orderBy(schema.movements.dateFrom);
  const ok = all.length > 0 || periods.length > 0;
  await db.insert(schema.paymentLookups).values({ ip, idKey: parsed.base ?? parsed.full, ok });
  if (!ok) {
    return {
      ok: false,
      error: "No encontramos pagos con ese documento. Revisa el número: escribe la cédula o el NIT tal como aparece en tu documento (con o sin puntos, guion y dígito de verificación).",
    };
  }
  if (!all.length) {
    return {
      ok: true,
      beneficiary: periods[0].m.customerName,
      identification: periods[0].m.identificationRaw,
      count: periods.reduce((s, p) => s + (p.m.withdrawals ?? 0), 0),
      total: periods.reduce((s, p) => s + Number(p.m.amount), 0),
      groups: [],
      periods: periods.map(({ m, number, invoiceId, invStatus }) => ({
        company: m.company,
        beneficiary: m.customerName,
        identification: m.identificationRaw,
        from: m.dateFrom?.toISOString() ?? null,
        to: m.dateTo?.toISOString() ?? null,
        withdrawals: m.withdrawals,
        amount: Number(m.amount),
        invoice: number ?? null,
        invoiceId: invStatus === "sent" ? invoiceId : null,
      })),
    };
  }

  // La factura emitida desde Jero para un pago: la del movimiento ("Facturas por emitir") de la misma
  // empresa cuyo periodo cubre la fecha del pago.
  const movs = await db
    .select({
      company: schema.movements.company,
      from: schema.movements.dateFrom,
      to: schema.movements.dateTo,
      id: schema.invoices.id,
      number: schema.invoices.siigoNumber,
      date: schema.invoices.date,
      total: schema.invoices.total,
    })
    .from(schema.movements)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.movements.invoiceId))
    .where(and(movementMatch, eq(schema.invoices.status, "sent")));
  const jeroInvoiceFor = (company: string, paidAt: Date) => {
    const d = day(paidAt)!;
    return movs.find((m) => m.company.toUpperCase() === company && day(m.from)! <= d && d <= day(m.to)!) ?? null;
  };

  // Cada pago va a la factura donde quedó: lo ya facturado antes (columna "Factura(s) FV" del cruce) y
  // lo que faltaba, a la factura que emitió Jero. Un pago facturado en parte sale en las dos.
  const groups = new Map<string, InvoiceGroup>();
  const add = (g: Omit<InvoiceGroup, "total" | "payments">, p: PaymentRow) => {
    const cur = groups.get(g.key) ?? { ...g, total: 0, payments: [] };
    cur.payments.push(p);
    cur.total += p.amount;
    groups.set(g.key, cur);
  };
  const cents = (n: number) => Math.round(n * 100) / 100;
  for (const w of all) {
    const net = Number(w.netAmount);
    const invoiced = w.invoicedAmount !== null ? Number(w.invoicedAmount) : w.invoiceRef && w.status === "FACTURADA" ? net : 0;
    const pending = w.pendingAmount !== null ? Number(w.pendingAmount) : cents(net - invoiced);
    const base = { paidAt: w.paidAt.toISOString(), company: w.company, bank: w.bank, invoices: null };
    // Las facturas anteriores van juntas: un pago suele repartirse entre dos de ellas y por separado
    // salían decenas de grupos sueltos que el cliente no entendía.
    if (w.invoiceRef && invoiced > 0.005) {
      add(
        { key: "anterior", kind: "anterior", number: null, date: null, invoiceId: null, invoiceTotal: null },
        { ...base, invoices: w.invoiceRef, amount: cents(invoiced), full: invoiced < net - 0.005 ? net : null },
      );
    }
    if (pending > 0.005) {
      const inv = jeroInvoiceFor(w.company, w.paidAt);
      add(
        inv
          ? { key: `jero:${inv.id}`, kind: "jero", number: inv.number, date: inv.date, invoiceId: inv.id, invoiceTotal: Number(inv.total) }
          : { key: "pendiente", kind: "pendiente", number: null, date: null, invoiceId: null, invoiceTotal: null },
        { ...base, amount: cents(pending), full: pending < net - 0.005 ? net : null },
      );
    }
  }
  // Primero las facturas de Jero (las que el cliente recibió y está revisando), de la más reciente a la
  // más antigua; luego lo facturado antes y, al final, lo que falta por facturar.
  const rank = { jero: 0, anterior: 1, pendiente: 2 } as const;
  const ordered = [...groups.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || (b.date ?? "").localeCompare(a.date ?? ""));

  return {
    ok: true,
    beneficiary: all[0].beneficiary,
    identification: all[0].identificationRaw,
    count: all.length,
    total: all.reduce((s, w) => s + Number(w.netAmount), 0),
    groups: ordered,
    periods: [],
  };
}

/** ¿La factura (emitida desde Jero) es de este documento? Para dejar ver su PDF desde la consulta pública. */
export async function invoiceOfDocument(invoiceId: number, doc: string) {
  const keys = lookupKeys(doc);
  if (!keys.length || !Number.isInteger(invoiceId)) return null;
  const db = await getDb();
  const inv = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.id, invoiceId), inArray(schema.invoices.customerIdentification, keys), eq(schema.invoices.status, "sent")),
  });
  return inv?.siigoId ? inv : null;
}
