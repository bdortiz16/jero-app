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
