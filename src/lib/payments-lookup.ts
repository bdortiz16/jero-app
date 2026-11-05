import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { lookupKeys } from "./withdrawals";

export type PaymentRow = {
  paidAt: string;
  company: string;
  beneficiary: string;
  identification: string;
  bank: string | null;
  amount: number;
  invoice: string | null;
};

// Límites para que nadie recorra documentos al azar: por IP y por documento, en la última hora.
const MAX_PER_IP = 20;
const MAX_FAILED_PER_DOC = 5;

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : null);

/**
 * Consulta pública de pagos con solo la cédula o el NIT (decisión del negocio: los clientes no
 * tienen otro dato a mano). Para que nadie recorra documentos al azar hay límite de consultas por
 * IP, y de la cuenta destino no se muestra ningún dígito, solo el banco.
 */
export async function lookupPayments(doc: string, ip: string): Promise<{ ok: true; rows: PaymentRow[] } | { ok: false; error: string }> {
  const keys = lookupKeys(doc);
  if (!keys.length) return { ok: false, error: "Escribe tu cédula o NIT (solo números)." };

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

  const all = await db.select().from(schema.withdrawals).where(inArray(schema.withdrawals.idKey, keys)).orderBy(schema.withdrawals.paidAt);
  const ok = all.length > 0;
  await db.insert(schema.paymentLookups).values({ ip, idKey: keys[keys.length - 1], ok });
  if (!ok) return { ok: false, error: "No encontramos pagos con ese documento. Revisa el número." };

  // Número de factura: el del archivo de cruce o, si no, el de la factura emitida desde Jero
  // para el movimiento que cubre la fecha del retiro.
  const movs = await db
    .select({ company: schema.movements.company, from: schema.movements.dateFrom, to: schema.movements.dateTo, number: schema.invoices.siigoNumber })
    .from(schema.movements)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.movements.invoiceId))
    .where(inArray(schema.movements.identification, keys));
  const invoiceFor = (company: string, paidAt: Date) => {
    const d = day(paidAt)!;
    return movs.find((m) => m.number && m.company.toUpperCase() === company && day(m.from)! <= d && d <= day(m.to)!)?.number ?? null;
  };

  return {
    ok: true,
    rows: all.map((w) => ({
      paidAt: w.paidAt.toISOString(),
      company: w.company,
      beneficiary: w.beneficiary,
      identification: w.identificationRaw,
      bank: w.bank,
      amount: Number(w.netAmount),
      invoice: w.invoiceRef || invoiceFor(w.company, w.paidAt),
    })),
  };
}
