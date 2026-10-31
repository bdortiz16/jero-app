import { normalizeHeader, parseDate, parseNumber, type RawRow } from "./batch/build";

/** Dígito de verificación DIAN de un NIT. */
export function nitCheckDigit(nit: string): number {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.replace(/\D/g, "").split("").reverse();
  const sum = digits.reduce((s, d, i) => s + Number(d) * weights[i], 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

const COMPANY_WORDS = /\b(S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?|E\.?\s?U\.?|S\.?\s?C\.?\s?A\.?|CORPORACI[OÓ]N|FUNDACI[OÓ]N|ASOCIACI[OÓ]N|COOPERATIVA|SOCIEDAD|INC\.?|CORP\.?)\b/i;

/**
 * Interpreta la identificación tal como viene en el archivo.
 * Los NIT suelen venir con el DV pegado (9019703613 = 901970361-3): si los primeros 9 dígitos empiezan en 8 o 9
 * y el último dígito es su DV válido, se separan. Lo demás se trata como cédula.
 */
export function parseIdentification(raw: string, name = "") {
  const clean = raw.replace(/[.\s]/g, "");
  // "NIT-DV" explícito: se toma como NIT (con el DV calculado, por si venía mal digitado)
  const withDash = clean.match(/^(\d{6,12})-(\d)$/);
  if (withDash) {
    return { identification: withDash[1], checkDigit: String(nitCheckDigit(withDash[1])), personType: "Company" as const, idType: "31" };
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 10 && /^[89]/.test(digits) && nitCheckDigit(digits.slice(0, 9)) === Number(digits[9])) {
    return { identification: digits.slice(0, 9), checkDigit: digits[9], personType: "Company" as const, idType: "31" };
  }
  if (COMPANY_WORDS.test(name) && /^[89]\d{8}$/.test(digits)) {
    return { identification: digits, checkDigit: String(nitCheckDigit(digits)), personType: "Company" as const, idType: "31" };
  }
  return { identification: digits || clean, checkDigit: null, personType: "Person" as const, idType: "13" };
}

/** Siigo pide [nombres, apellidos] para personas naturales y [razón social] para empresas. */
/**
 * Siigo rechaza nombres con comillas, apóstrofos, & y otros símbolos ("invalid_name").
 * Se deja solo letras, números, espacio, punto, coma y guion; "&" pasa a "Y".
 */
export function cleanSiigoName(fullName: string) {
  return fullName
    .replace(/&/g, " Y ")
    .replace(/[^\p{L}\p{N} .,\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Siigo arma el contacto principal con el nombre del cliente y lo limita a 101 caracteres. */
export const SIIGO_NAME_MAX = 100;

/** Recorta en el último espacio antes del límite para no partir palabras. */
function cut(text: string, max: number) {
  if (text.length <= max) return text;
  const part = text.slice(0, max + 1);
  const at = part.lastIndexOf(" ");
  return (at > max * 0.6 ? part.slice(0, at) : text.slice(0, max)).trim();
}

export function siigoName(fullName: string, personType: "Person" | "Company"): string[] {
  const name = cut(cleanSiigoName(fullName), SIIGO_NAME_MAX);
  if (personType === "Company") return [name];
  const w = name.split(" ");
  if (w.length === 1) return [w[0], w[0]].map((x) => cut(x, SIIGO_NAME_MAX / 2));
  if (w.length === 2) return [w[0], w[1]];
  if (w.length === 3) return [w[0], `${w[1]} ${w[2]}`];
  return [w.slice(0, w.length - 2).join(" "), w.slice(-2).join(" ")];
}

export type ParsedMovement = {
  rowNumber: number | null;
  company: string;
  customerName: string;
  identificationRaw: string;
  identification: string;
  checkDigit: string | null;
  personType: "Person" | "Company";
  withdrawals: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  amount: number;
};

const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (!s) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) return iso;
  const d = parseDate(s);
  return d ? new Date(`${d}T12:00:00Z`) : null;
};

/** Convierte las filas del archivo "Facturas por emitir" en movimientos. */
export function parseMovementRows(rows: RawRow[]): { movements: ParsedMovement[]; errors: { row: number; message: string }[] } {
  const movements: ParsedMovement[] = [];
  const errors: { row: number; message: string }[] = [];
  const get = (r: RawRow, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v !== null && v !== undefined && String(v).trim() !== "");
  rows.forEach((r, i) => {
    const fila = typeof r.__fila === "number" ? r.__fila : i + 2;
    const name = String(get(r, "cliente_beneficiario", "cliente", "beneficiario", "nombre") ?? "").trim();
    const idRaw = String(get(r, "identificacion", "nit", "cedula", "documento") ?? "").trim();
    const amount = parseNumber(get(r, "valor_a_facturar", "valor", "valor_dispersado"));
    if (!name && !idRaw && amount === null) return; // fila vacía o de totales
    if (!idRaw) return errors.push({ row: fila, message: "Falta la identificación" });
    if (!name) return errors.push({ row: fila, message: "Falta el nombre del cliente" });
    if (amount === null || amount <= 0) return errors.push({ row: fila, message: "Valor a facturar inválido" });
    const id = parseIdentification(idRaw, name);
    const num = get(r, "numero", "no");
    movements.push({
      rowNumber: num !== undefined && Number.isFinite(Number(num)) ? Number(num) : null,
      company: String(get(r, "empresa_que_factura", "empresa", "banco") ?? "").trim() || "—",
      customerName: name,
      identificationRaw: idRaw,
      identification: id.identification,
      checkDigit: id.checkDigit,
      personType: id.personType,
      withdrawals: parseNumber(get(r, "retiros", "num_retiros", "cantidad_retiros")),
      dateFrom: toDate(get(r, "desde", "fecha_desde")),
      dateTo: toDate(get(r, "hasta", "fecha_hasta")),
      amount,
    });
  });
  return { movements, errors };
}

export { normalizeHeader };
