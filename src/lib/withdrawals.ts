import { normalizeHeader } from "./batch/build";
import { nitCheckDigit, parseIdentification } from "./movements";

/** Retiro tal como se manda al servidor al importar (fechas en ISO). */
export type WithdrawalDTO = {
  company: string;
  paidAt: string;
  beneficiary: string;
  idType: string | null;
  identificationRaw: string;
  idKey: string;
  bank: string | null;
  accountLast4: string | null;
  amount: number;
  netAmount: number;
  status: string | null;
  invoiceRef: string | null;
  invoicedAmount: number | null;
  pendingAmount: number | null;
};

type Sheet = { sheet: string; data: unknown[][] };

// Estos retiros no son pagos a un cliente: movimientos entre cuentas propias o sin beneficiario.
const NOT_A_PAYMENT = /TRASLADO PROPIO|SIN DATOS/i;
// Las hojas "EMITIDAS" / "PARCIALES" repiten filas de las hojas JERO y KAUPALOKI.
const REPEATED_SHEET = /EMITIDAS|PARCIALES|FALTAN|RESUMEN|SIN RETIRO/i;

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Las fechas del Excel no traen zona horaria: read-excel-file las entrega como si fueran UTC.
 * Son hora de Colombia (UTC−5), así que se corrigen para guardar el instante real.
 */
function bogotaDate(v: unknown): Date | null {
  // Excel guarda la hora como fracción de día: llega con milésimas de error (…:09.999). Se redondea
  // al segundo para que el mismo retiro tenga siempre la misma fecha y no se duplique al recargar.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(Math.round((v.getTime() + 5 * 3600_000) / 1000) * 1000);
  if (typeof v === "string" && v.trim()) {
    const d = new Date(`${v.trim().replace(" ", "T")}-05:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Lee las hojas de retiros del archivo de cruce ("Fecha retiro", "Beneficiario", "Identificación",
 * "Banco destino", "Cuenta destino", "Importe", "Importe neto", "Estado", "Factura(s) FV", "Clave tercero").
 * La empresa que pagó sale del nombre de la hoja (JERO, KAUPALOKI).
 */
export function parseWithdrawalSheets(sheets: Sheet[]): { rows: WithdrawalDTO[]; skipped: number; sheets: string[] } {
  const rows: WithdrawalDTO[] = [];
  const used: string[] = [];
  let skipped = 0;
  for (const { sheet, data } of sheets) {
    if (REPEATED_SHEET.test(sheet)) continue;
    const start = data.slice(0, 30).findIndex((r) => r.some((c) => normalizeHeader(String(c ?? "")) === "fecha_retiro"));
    if (start < 0) continue;
    used.push(sheet);
    const headers = data[start].map((h) => normalizeHeader(String(h ?? "")));
    const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
    const c = {
      fecha: col("fecha_retiro"),
      benef: col("beneficiario"),
      tipo: col("tipo_id"),
      ident: col("identificacion"),
      banco: col("banco_destino"),
      cuenta: col("cuenta_destino"),
      importe: col("importe"),
      neto: col("importe_neto"),
      estado: col("estado"),
      factura: col("factura_s_fv", "facturas_fv", "factura_fv", "factura"),
      clave: col("clave_tercero"),
      facturado: col("valor_facturado_asignado"),
      pendiente: col("pendiente_por_facturar"),
    };
    const company = sheet.trim().toUpperCase();
    for (const r of data.slice(start + 1)) {
      const at = (i: number) => (i >= 0 ? r[i] : null);
      const paidAt = bogotaDate(at(c.fecha));
      const identificationRaw = String(at(c.ident) ?? "").trim();
      const status = String(at(c.estado) ?? "").trim() || null;
      const net = num(at(c.neto));
      const amount = num(at(c.importe));
      if (!paidAt || !identificationRaw || !Number.isFinite(net) || (status && NOT_A_PAYMENT.test(status))) {
        if (paidAt || identificationRaw) skipped++;
        continue;
      }
      const beneficiary = String(at(c.benef) ?? "").replace(/\s+/g, " ").trim() || "(sin nombre)";
      const clave = String(at(c.clave) ?? "").replace(/\D/g, "");
      const account = String(at(c.cuenta) ?? "").replace(/\D/g, "");
      rows.push({
        company,
        paidAt: paidAt.toISOString(),
        beneficiary,
        idType: String(at(c.tipo) ?? "").trim() || null,
        identificationRaw,
        idKey: clave || parseIdentification(identificationRaw, beneficiary).identification,
        bank: String(at(c.banco) ?? "").trim() || null,
        accountLast4: account.length >= 4 ? account.slice(-4) : null,
        amount: Number.isFinite(amount) ? amount : net,
        netAmount: net,
        status,
        invoiceRef: String(at(c.factura) ?? "").trim() || null,
        invoicedAmount: c.facturado >= 0 && Number.isFinite(num(at(c.facturado))) ? num(at(c.facturado)) : null,
        pendingAmount: c.pendiente >= 0 && Number.isFinite(num(at(c.pendiente))) ? num(at(c.pendiente)) : null,
      });
    }
  }
  return { rows, skipped, sheets: used };
}

/** Documento escrito por el cliente, ya limpio. */
export type DocInput = {
  /** Todos los dígitos tal cual (sin puntos, espacios ni guion). */
  full: string;
  /** El NIT sin el dígito de verificación, si el número lo trae. */
  base: string | null;
  /** El cliente escribió el guion (900123456-7): es un NIT seguro. */
  explicitNit: boolean;
};

/**
 * Interpreta el documento como lo escriba el cliente: "1.005.237.062", "900 123 456", "900123456-7",
 * "NIT 900.123.456-7" o "9001234567". Si trae dígito de verificación (con guion, o 10 dígitos que
 * empiezan por 8 o 9 y cuyo último dígito es un DV válido), también se busca sin él.
 */
export function parseDocInput(input: string): DocInput | null {
  const clean = input.replace(/[^\d-]/g, "").replace(/^0+/, "");
  const withDash = clean.match(/^(\d{5,14})-+(\d)$/);
  if (withDash) return { full: withDash[1] + withDash[2], base: withDash[1], explicitNit: true };
  const d = clean.replace(/\D/g, "");
  if (d.length < 5 || d.length > 15) return null;
  const base = d.length >= 9 && /^[89]/.test(d) && nitCheckDigit(d.slice(0, -1)) === Number(d.slice(-1)) ? d.slice(0, -1) : null;
  return { full: d, base, explicitNit: false };
}

/** Compatibilidad: las claves a buscar (con y sin dígito de verificación). */
export function lookupKeys(input: string): string[] {
  const p = parseDocInput(input);
  return p ? [p.full, ...(p.base ? [p.base] : [])] : [];
}

/** Nombre del banco legible: "banco_de_bogota" → "Banco De Bogota". */
export function bankLabel(bank: string | null) {
  if (!bank) return "—";
  return bank.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()).replace(/\bSa\b/, "S.A.");
}
