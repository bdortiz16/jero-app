import "server-only";
import { SiigoClient, type SiigoApi } from "./client";
import { SiigoMock } from "./mock";
import { getSetting, getSiigoCredentials, setSetting } from "../settings";
import type { SiigoPaymentType, SiigoTax } from "./types";

export * from "./types";
export type { SiigoApi } from "./client";

export const siigoMockEnabled = () => process.env.SIIGO_MOCK === "true";

export class SiigoNotConfigured extends Error {
  constructor() {
    super("Siigo no está configurado. Un administrador debe ingresar las credenciales en Admin → Siigo.");
  }
}

export async function getSiigo(): Promise<SiigoApi> {
  if (siigoMockEnabled()) return new SiigoMock();
  const creds = await getSiigoCredentials();
  if (!creds) throw new SiigoNotConfigured();
  return new SiigoClient({
    baseUrl: process.env.SIIGO_API_URL ?? "https://api.siigo.com",
    ...creds,
    tokenStore: {
      get: () => getSetting("siigo:token"),
      set: (v) => setSetting("siigo:token", v),
    },
  });
}

export type Catalogs = {
  documentTypes: { id: number; name: string; code: string }[];
  taxes: SiigoTax[];
  paymentTypes: SiigoPaymentType[];
  sellers: { id: number; name: string }[];
  costCenters: { id: number; name: string; code: string }[];
  fetchedAt: string;
};

export async function refreshCatalogs(): Promise<Catalogs> {
  const s = await getSiigo();
  // Secuencial para no golpear el límite de peticiones de Siigo.
  const documentTypes = await s.documentTypes("FV");
  const taxes = await s.taxes();
  const paymentTypes = await s.paymentTypes("FV");
  const users = await s.users();
  const costCenters = await s.costCenters().catch(() => []);
  const catalogs: Catalogs = {
    documentTypes: documentTypes.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, code: d.code })),
    taxes: taxes.filter((t) => t.active),
    paymentTypes: paymentTypes.filter((p) => p.active),
    sellers: users.filter((u) => u.active).map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim() || u.username })),
    costCenters: costCenters.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, code: c.code })),
    fetchedAt: new Date().toISOString(),
  };
  await setSetting("siigo:catalogs", catalogs);
  return catalogs;
}

export async function getCatalogs(): Promise<Catalogs | null> {
  return getSetting<Catalogs>("siigo:catalogs");
}

/**
 * Tipo de comprobante a usar: el configurado; si no hay, el único de factura de venta de Siigo,
 * o el que sea "electrónica" cuando hay varios. null = hay que elegirlo en Conexión Siigo.
 */
export function resolveDocumentId(defaults: { documentId: number | null }, catalogs: Catalogs | null): number | null {
  if (defaults.documentId) return defaults.documentId;
  const docs = catalogs?.documentTypes ?? [];
  if (docs.length === 1) return docs[0].id;
  const electronic = docs.filter((d) => /electr/i.test(d.name));
  return electronic.length === 1 ? electronic[0].id : null;
}
