"use server";
import { headers } from "next/headers";
import { lookupPayments } from "@/lib/payments-lookup";

export async function consultarPagos(doc: string) {
  const h = await headers();
  const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "local").trim().slice(0, 64);
  try {
    return await lookupPayments(String(doc ?? "").slice(0, 30), ip);
  } catch {
    return { ok: false as const, error: "No pudimos consultar en este momento. Intenta de nuevo en unos minutos." };
  }
}

export async function solicitarNotaCredito(input: import("@/lib/credit-notes").CreditNoteInput) {
  const h = await headers();
  const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "local").trim().slice(0, 64);
  const { requestCreditNote } = await import("@/lib/credit-notes");
  try {
    return await requestCreditNote(
      {
        doc: String(input?.doc ?? "").slice(0, 30),
        invoiceId: Number.isInteger(input?.invoiceId) ? input.invoiceId : null,
        invoiceNumber: String(input?.invoiceNumber ?? "").slice(0, 40),
        contactName: String(input?.contactName ?? ""),
        email: String(input?.email ?? ""),
        phone: String(input?.phone ?? ""),
        reason: String(input?.reason ?? ""),
        detail: String(input?.detail ?? ""),
      },
      ip,
    );
  } catch {
    return { ok: false as const, error: "No pudimos enviar la solicitud. Intenta de nuevo en unos minutos." };
  }
}
