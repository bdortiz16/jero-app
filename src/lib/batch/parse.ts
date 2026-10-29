import Papa from "papaparse";
import { normalizeHeader, type RawRow } from "./build";

const MAX_ROWS = 5000;

/** Lee un CSV o XLSX y devuelve filas con encabezados normalizados. */
export async function parseFile(name: string, data: ArrayBuffer): Promise<RawRow[]> {
  const lower = name.toLowerCase();
  let matrix: unknown[][];
  if (lower.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/universal");
    matrix = (await readSheet(data)) as unknown[][];
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    // Excel en español suele exportar con ; como separador
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy" });
    matrix = res.data;
  } else {
    throw new Error("Formato no soportado. Use .csv o .xlsx");
  }
  if (matrix.length < 2) throw new Error("El archivo no tiene filas de datos");
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`Máximo ${MAX_ROWS} filas por archivo`);

  const headers = matrix[0].map((h) => normalizeHeader(String(h ?? "")));
  return matrix.slice(1).map((cells) => {
    const row: RawRow = {};
    headers.forEach((h, i) => {
      if (h) row[h] = cells[i] ?? null;
    });
    return row;
  });
}
