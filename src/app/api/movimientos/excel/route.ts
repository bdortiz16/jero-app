import writeExcelFile from "write-excel-file/node";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { movementOrder, movementWhere } from "@/lib/movement-filters";

export const maxDuration = 60;

const day = (d: Date | null) => (d ? d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "");

/** Excel de los movimientos (con los filtros de la lista) y el número de factura de cada uno. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const p = new URL(req.url).searchParams;
  const f = { q: p.get("q") ?? "", empresa: p.get("empresa") ?? "", estado: p.get("estado") ?? "", min: p.get("min") ?? "", max: p.get("max") ?? "", orden: p.get("orden") ?? "" };
  const where = movementWhere(f);
  const db = await getDb();
  const rows = await db
    .select({ m: schema.movements, inv: schema.invoices })
    .from(schema.movements)
    .leftJoin(schema.invoices, eq(schema.invoices.id, schema.movements.invoiceId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...movementOrder(f.orden));

  const H = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0F3D2E", textColor: "#FFFFFF", wrap: true });
  const S = (v: unknown) => ({ value: v === null || v === undefined ? "" : String(v), type: String });
  const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : { value: Number(v), type: Number, format: "#,##0.00" });
  const data = [
    ["#", "Empresa que factura", "Cliente (beneficiario)", "Identificación", "# retiros", "Desde", "Hasta", "Valor a facturar", "Estado", "Factura", "Fecha factura", "Total factura", "CUFE"].map(H),
    ...rows.map(({ m, inv }) => [
      S(m.rowNumber ?? m.id), S(m.company), S(m.customerName), S(m.identificationRaw), N(m.withdrawals), S(day(m.dateFrom)), S(day(m.dateTo)),
      N(m.amount), S(m.status), S(inv?.siigoNumber), S(inv?.siigoNumber ? inv.date : ""), N(inv?.siigoNumber ? inv.total : null), S(inv?.cufe),
    ]),
  ];
  const buffer = await writeExcelFile(data as never, {
    sheet: "Movimientos",
    stickyRowsCount: 1,
    columns: [6, 14, 40, 16, 9, 12, 12, 20, 11, 14, 13, 20, 36].map((width) => ({ width })),
  }).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="movimientos-con-factura.xlsx"`,
    },
  });
}
