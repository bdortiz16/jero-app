import { and, or, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/** Palabras que no ayudan a encontrar un nombre (tipo de sociedad, conectores). */
const STOP = new Set(["sas", "sa", "ltda", "bic", "sca", "y", "e", "s", "a"]);

/**
 * Convierte la búsqueda en palabras comparables: sin tildes, sin mayúsculas, sin puntos ni "&",
 * y sin "S.A.S." / "LTDA" (así "Ingeniería Maquinaria Equipos & Construcciones S.A.S." encuentra
 * "INGENIERIA MAQUINARIA EQUIPOS Y CONSTRUCCIONES SAS").
 */
export function searchTokens(q: string): string[] {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.&'´`"]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
}

/** El texto de la columna normalizado igual que la búsqueda, todo junto (sin espacios ni símbolos). */
const compact = (col: AnyColumn | SQL) =>
  sql`regexp_replace(translate(lower(${col}), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]', '', 'g')`;

/**
 * Condición: el nombre contiene todas las palabras buscadas (en cualquier orden y forma de escribirse).
 * Varios nombres separados por ";" buscan cualquiera de ellos.
 */
export function nameMatches(col: AnyColumn | SQL, q: string): SQL | undefined {
  const parts = q
    .split(";")
    .map(searchTokens)
    .filter((w) => w.length)
    .map((words) => and(...words.map((w) => sql`${compact(col)} like ${`%${w}%`}`))!);
  if (!parts.length) return undefined;
  return parts.length === 1 ? parts[0] : or(...parts);
}

/** Búsqueda por identificación: solo dígitos, admite varias separadas por ";". */
export function idMatches(col: AnyColumn | SQL, q: string): SQL | undefined {
  const ids = q.split(";").map((p) => p.replace(/[^0-9]/g, "")).filter((d) => d.length >= 4);
  if (!ids.length) return undefined;
  return or(...ids.map((d) => sql`regexp_replace(${col}, '[^0-9]', '', 'g') like ${`%${d}%`}`));
}
