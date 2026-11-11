import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseDocInput } from "./withdrawals";
import { documentHasOldInvoice, invoiceOfDocument } from "./payments-lookup";
import { CREDIT_NOTE_REASONS } from "./credit-note-options";
export { CREDIT_NOTE_REASONS, CREDIT_NOTE_STATUS } from "./credit-note-options";

export type CreditNoteInput = {
  doc: string;
  invoiceId: number | null;
  invoiceNumber: string;
  contactName: string;
  email: string;
  phone: string;
  reason: string;
  detail: string;
};

// Límite por IP para que nadie llene la bandeja con solicitudes falsas.
const MAX_PER_IP_HOUR = 5;

/**
 * Registra la solicitud de nota crédito de un cliente desde la consulta pública. Solo se acepta si la
 * factura es del documento consultado; si ya hay una solicitud abierta para esa factura, no se repite.
 */
export async function requestCreditNote(input: CreditNoteInput, ip: string): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const parsed = parseDocInput(input.doc);
  if (!parsed) return { ok: false, error: "Documento inválido. Vuelve a consultar tus pagos." };
  const contactName = input.contactName.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 160);
  const phone = input.phone.replace(/[^\d+ ]/g, "").trim().slice(0, 30);
  const detail = input.detail.trim().slice(0, 2000);
  const reason = (CREDIT_NOTE_REASONS as readonly string[]).includes(input.reason) ? input.reason : null;
  if (!reason) return { ok: false, error: "Elige el motivo de la solicitud." };
  if (contactName.length < 3) return { ok: false, error: "Escribe tu nombre." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Escribe un correo válido para responderte." };
  if (detail.length < 10) return { ok: false, error: "Cuéntanos en pocas palabras qué está mal (mínimo 10 caracteres)." };

  // La factura debe ser de este documento: una emitida desde Jero, o una anterior donde quedaron sus pagos.
  let invoiceId: number | null = null;
  let invoiceNumber: string;
  let beneficiary: string | null = null;
  let identification = parsed.full;
  if (input.invoiceId) {
    const inv = await invoiceOfDocument(input.invoiceId, input.doc);
    if (!inv) return { ok: false, error: "No encontramos esa factura para tu documento." };
    invoiceId = inv.id;
    invoiceNumber = inv.siigoNumber ?? inv.reference;
    beneficiary = inv.customerName;
    identification = inv.customerIdentification;
  } else {
    const w = await documentHasOldInvoice(input.doc, input.invoiceNumber);
    if (!w) return { ok: false, error: "No encontramos esa factura para tu documento." };
    invoiceNumber = input.invoiceNumber.trim().toUpperCase();
    beneficiary = w.beneficiary;
    identification = w.identification;
  }

  const db = await getDb();
  const T = schema.creditNoteRequests;
  const idKey = parsed.base ?? parsed.full;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(T)
    .where(and(eq(T.ip, ip), gte(T.createdAt, new Date(Date.now() - 3600_000))));
  if (Number(n) >= MAX_PER_IP_HOUR) return { ok: false, error: "Ya enviaste varias solicitudes. Espera una hora e intenta de nuevo." };

  const open = await db.query.creditNoteRequests.findFirst({
    where: and(eq(T.invoiceNumber, invoiceNumber), inArray(T.idKey, [parsed.full, ...(parsed.base ? [parsed.base] : [])]), inArray(T.status, ["pendiente", "en_revision"])),
  });
  if (open) return { ok: true, already: true };

  await db.insert(T).values({ invoiceId, invoiceNumber, idKey, identification, beneficiary, contactName, email, phone: phone || null, reason, detail, ip });
  return { ok: true, already: false };
}
