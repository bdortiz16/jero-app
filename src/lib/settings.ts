import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { encrypt, decrypt } from "./crypto";

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return (row?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  if (value === null || value === undefined) {
    await db.delete(schema.settings).where(eq(schema.settings.key, key));
    return;
  }
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

export type SiigoCredentials = { username: string; accessKey: string; partnerId: string };

export type SiigoDefaults = {
  documentId: number | null;
  sellerId: number | null;
  paymentId: number | null;
  costCenterId: number | null;
  /** Días de plazo para pagos a crédito cuando el archivo no trae vencimiento. */
  dueDays: number;
  sendStamp: boolean;
  sendMail: boolean;
  /**
   * Empresas del archivo de movimientos que se facturan con esta conexión de Siigo,
   * separadas por coma ("*" = todas).
   */
  issuerCompanies: string;
  /** Datos para crear en Siigo los clientes que no existan (el archivo no trae dirección ni ciudad). */
  newCustomerAddress: string;
  newCustomerStateCode: string;
  newCustomerCityCode: string;
  newCustomerEmail: string;
};

export const DEFAULTS: SiigoDefaults = {
  documentId: null,
  sellerId: null,
  paymentId: null,
  costCenterId: null,
  dueDays: 30,
  sendStamp: true,
  sendMail: true,
  issuerCompanies: "*",
  newCustomerAddress: "Sin dirección",
  newCustomerStateCode: "11",
  newCustomerCityCode: "11001",
  newCustomerEmail: "",
};

export async function getSiigoCredentials(): Promise<SiigoCredentials | null> {
  const stored = await getSetting<{ username: string; accessKey: string; partnerId: string }>("siigo:credentials");
  if (!stored) return null;
  return { ...stored, accessKey: await decrypt(stored.accessKey) };
}

export async function saveSiigoCredentials(c: SiigoCredentials) {
  await setSetting("siigo:credentials", { ...c, accessKey: await encrypt(c.accessKey) });
  await setSetting("siigo:token", null);
}

/** ¿Se puede facturar con esta conexión un movimiento de esta empresa? */
export function companyAllowed(company: string, issuerCompanies: string) {
  const list = issuerCompanies.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes("*") || list.includes(company.trim().toLowerCase());
}

export async function getSiigoDefaults(): Promise<SiigoDefaults> {
  return { ...DEFAULTS, ...((await getSetting<Partial<SiigoDefaults>>("siigo:defaults")) ?? {}) };
}
