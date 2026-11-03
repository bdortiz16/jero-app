import "server-only";
import { strToU8, zipSync } from "fflate";
import writeExcelFile from "write-excel-file/node";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSiigo } from "./siigo";
import { movementOrder, movementWhere, type MovementFilters } from "./movement-filters";

/** Máximo de movimientos por descarga: cada PDF se pide a Siigo y la función tiene ~60 s. */
export const SUPPORT_MAX = 60;

const day = (d: Date | null) => (d ? d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "");
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/** Movimientos a incluir: por ids, o los del filtro de la lista. */
export async function supportMovements(opts: { ids?: number[]; filters?: MovementFilters }) {
  const db = await getDb();
  const where: SQL[] = opts.ids ? [inArray(schema.movements.id, opts.ids.length ? opts.ids : [-1])] : movementWhere(opts.filters ?? {});
  return db
    .select({ m: schema.movements, inv: schema.invoices })
    .from(schema.movements)
    .leftJoin(schema.invoices, eq(schema.invoices.id, schema.movements.invoiceId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...movementOrder(opts.filters?.orden))
    .limit(SUPPORT_MAX + 1);
}

type Row = Awaited<ReturnType<typeof supportMovements>>[number];

/**
 * ZIP con el soporte de cada movimiento: el PDF de su factura (de Siigo) y un Excel con el detalle
 * del movimiento y su facturación (número, CUFE, comisión, IVA, retención).
 */
export async function buildSupportZip(rows: Row[]) {
  const files: Record<string, Uint8Array> = {};
  const pdfStatus = new Map<number, string>();
  const siigo = rows.some((r) => r.inv?.siigoId) ? await getSiigo() : null;

  // De a 3 PDFs a la vez para no chocar con el límite de peticiones de Siigo.
  const queue = rows.filter((r) => r.inv?.siigoId);
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const name = `${r.m.rowNumber ?? r.m.id} - ${safe(r.m.customerName)} - ${r.inv!.siigoNumber ?? `factura-${r.inv!.id}`}.pdf`;
        try {
          const pdf = await siigo!.invoicePdf(r.inv!.siigoId!);
          if (pdf) {
            files[`facturas/${name}`] = pdf;
            pdfStatus.set(r.m.id, `facturas/${name}`);
          } else pdfStatus.set(r.m.id, "Siigo aún no entrega el PDF");
        } catch (e) {
          pdfStatus.set(r.m.id, `No se pudo descargar: ${(e as Error).message}`.slice(0, 200));
        }
      }
    }),
  );

  const H = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0F3D2E", textColor: "#FFFFFF", wrap: true });
  const S = (v: unknown) => ({ value: v === null || v === undefined ? "" : String(v), type: String });
  const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : { value: Number(v), type: Number, format: "#,##0.00" });
  const header = [
    "#", "Empresa que factura", "Cliente (beneficiario)", "Identificación", "# retiros", "Desde", "Hasta", "Valor dispersado", "Estado",
    "Factura", "Fecha factura", "Subtotal", "IVA", "Retención", "Total factura", "Estado DIAN", "CUFE", "Observaciones", "Archivo PDF",
  ].map(H);
  const data = [
    header,
    ...rows.map(({ m, inv }) => [
      S(m.rowNumber ?? m.id), S(m.company), S(m.customerName), S(m.identificationRaw), N(m.withdrawals), S(day(m.dateFrom)), S(day(m.dateTo)),
      N(m.amount), S(m.status), S(inv?.siigoNumber), S(inv?.date), N(inv?.subtotal), N(inv?.taxTotal), N(inv?.retentionTotal), N(inv?.total),
      S(inv?.stampStatus), S(inv?.cufe), S(inv?.payload.observations), S(pdfStatus.get(m.id) ?? (inv ? "Factura sin emitir en Siigo" : "Sin factura")),
    ]),
  ];
  const xlsx = await writeExcelFile(data as never, {
    sheet: "Movimientos",
    stickyRowsCount: 1,
    columns: [6, 14, 38, 16, 9, 12, 12, 20, 11, 13, 12, 18, 16, 16, 18, 12, 40, 50, 50].map((width) => ({ width })),
  }).toBuffer();
  files["movimientos.xlsx"] = new Uint8Array(xlsx);
  files["LEAME.txt"] = strToU8(
    "Soportes de operaciones - Jero Contable\r\n\r\n" +
      "movimientos.xlsx: cada movimiento (dispersión) con los datos de su factura electrónica.\r\n" +
      "facturas/: PDF de cada factura tal como la generó Siigo (validada por la DIAN, ver CUFE).\r\n",
  );
  return zipSync(files, { level: 6 });
}
