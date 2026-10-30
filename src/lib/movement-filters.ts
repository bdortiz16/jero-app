import { asc, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { schema } from "@/db/schema-export";

export type MovementFilters = { q?: string; empresa?: string; estado?: string; min?: string; max?: string; orden?: string };

const num = (v?: string) => {
  if (!v) return null;
  const n = Number(String(v).replace(/[.$\s]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Condiciones de la lista de movimientos (también las usa la emisión masiva, para emitir exactamente lo filtrado). */
export function movementWhere(f: MovementFilters): SQL[] {
  const m = schema.movements;
  const where: SQL[] = [];
  if (f.empresa) where.push(eq(m.company, f.empresa));
  if (f.estado) where.push(eq(m.status, f.estado));
  if (f.q) {
    const like = `%${f.q}%`;
    where.push(or(ilike(m.customerName, like), ilike(m.identificationRaw, like))!);
  }
  const min = num(f.min);
  const max = num(f.max);
  if (min !== null) where.push(gte(m.amount, min.toFixed(2)));
  if (max !== null) where.push(lte(m.amount, max.toFixed(2)));
  return where;
}

/** Orden: archivo (por defecto), menor valor o mayor valor. */
export function movementOrder(orden?: string) {
  const m = schema.movements;
  if (orden === "menor") return [asc(m.amount), asc(m.id)];
  if (orden === "mayor") return [desc(m.amount), asc(m.id)];
  return [asc(m.rowNumber), asc(m.id)];
}
