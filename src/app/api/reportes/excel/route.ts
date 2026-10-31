import writeExcelFile from "write-excel-file/node";
import { getSessionUser } from "@/lib/auth";
import { accountingSummary, retentionsByCustomer, salesLedgerDetailed } from "@/lib/reports";
import { activeModel } from "@/lib/movements-emit";
import { DEFAULT_COMMISSION_CONFIG } from "@/lib/batch/commission";
import { bimester, groupBy, journalEntry, monthLabel, sumRows, type Totals } from "@/lib/accounting";

export const maxDuration = 60;

type Cell = { value: string | number | null; type?: typeof String | typeof Number; format?: string; fontWeight?: "bold"; backgroundColor?: string; textColor?: string; wrap?: boolean } | null;
const MONEY = "#,##0.00";
const head = (v: string): Cell => ({ value: v, fontWeight: "bold", backgroundColor: "#0F3D2E", textColor: "#FFFFFF", wrap: true });
const txt = (v: unknown, bold = false): Cell => ({ value: v === null || v === undefined ? "" : String(v), type: String, ...(bold ? { fontWeight: "bold" as const } : {}) });
const num = (v: unknown, bold = false): Cell => ({ value: Number(v ?? 0), type: Number, format: MONEY, ...(bold ? { fontWeight: "bold" as const } : {}) });
const int = (v: unknown, bold = false): Cell => ({ value: Number(v ?? 0), type: Number, format: "#,##0", ...(bold ? { fontWeight: "bold" as const } : {}) });

const totalsHeader = (first: string) => [first, "Facturas", "Recibido para terceros", "Comisión (base)", "IVA", "Retención", "Total facturado"].map(head);
const totalsRow = (label: string, t: Totals, bold = false) => [txt(label, bold), int(t.count, bold), num(t.thirdParty, bold), num(t.commission, bold), num(t.tax, bold), num(t.retention, bold), num(t.total, bold)];

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const url = new URL(req.url);
  const from = url.searchParams.get("desde") ?? "2000-01-01";
  const to = url.searchParams.get("hasta") ?? "2999-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Fechas inválidas", { status: 400 });
  const code = (await activeModel())?.cfg.thirdPartyCode ?? DEFAULT_COMMISSION_CONFIG.thirdPartyCode;
  const [ledger, rows, retentions] = await Promise.all([
    salesLedgerDetailed(from, to, code),
    accountingSummary(from, to, code),
    retentionsByCustomer(from, to, code),
  ]);
  const t = sumRows(rows);

  // Hoja 1: libro de ventas, una fila por factura, con totales al final.
  const ledgerData: Cell[][] = [
    [txt(`Libro de ventas · ${from} a ${to}`, true)],
    [],
    ["Fecha", "Factura", "Referencia", "Empresa", "NIT / CC cliente", "Cliente", "Recibido para terceros", "Comisión (base)", "IVA", "Retención", "Total", "Estado DIAN", "CUFE"].map(head),
    ...ledger.map((r) => [
      txt(r.date), txt(r.siigo_number), txt(r.reference), txt(r.company), txt(r.customer_identification), txt(r.customer_name),
      num(r.third_party), num(r.commission), num(r.tax_total), num(r.retention_total), num(r.total), txt(r.stamp_status), txt(r.cufe),
    ]),
    [txt(`Total (${ledger.length} facturas)`, true), null, null, null, null, null, num(t.thirdParty, true), num(t.commission, true), num(t.tax, true), num(t.retention, true), num(t.total, true), null, null],
  ];

  // Hoja 2: resúmenes por empresa, por mes y bimestres de IVA.
  const byCompany = groupBy(rows, (r) => r.company);
  const byMonth = groupBy(rows, (r) => r.month);
  const byBimester = groupBy(rows, (r) => bimester(r.month).label);
  const summary: Cell[][] = [
    [txt(`Resumen contable · ${from} a ${to}`, true)],
    [],
    [txt("Por empresa", true)],
    totalsHeader("Empresa"),
    ...byCompany.map((c) => totalsRow(c.key, c)),
    totalsRow("Total", t, true),
    [],
    [txt("Por mes", true)],
    totalsHeader("Mes"),
    ...byMonth.map((m) => totalsRow(monthLabel(m.key), m)),
    totalsRow("Total", t, true),
    [],
    [txt("IVA por bimestre", true)],
    ["Bimestre", "Base gravada (comisión)", "IVA generado"].map(head),
    ...byBimester.map((b) => [txt(b.key), num(b.commission), num(b.tax)]),
    [txt("Total", true), num(t.commission, true), num(t.tax, true)],
  ];

  // Hoja 3: retenciones por cliente (para pedir certificados).
  const retData: Cell[][] = [
    ["NIT cliente", "Cliente", "Facturas", "Base (comisión)", "Retención"].map(head),
    ...retentions.map((r) => [txt(r.identification), txt(r.name), int(r.count), num(r.base), num(r.retention)]),
    [txt("Total", true), null, int(retentions.reduce((s, r) => s + r.count, 0), true), num(retentions.reduce((s, r) => s + r.base, 0), true), num(t.retention, true)],
  ];

  // Hoja 4: asiento contable sugerido.
  const journal = journalEntry(t);
  const journalData: Cell[][] = [
    ["Cuenta", "Nombre", "Débito", "Crédito"].map(head),
    ...journal.map((l) => [txt(l.account), txt(l.name), num(l.debit), num(l.credit)]),
    [txt("Sumas iguales", true), null, num(journal.reduce((s, l) => s + l.debit, 0), true), num(journal.reduce((s, l) => s + l.credit, 0), true)],
    [],
    [txt("Cuentas sugeridas del PUC: ajústalas a tu plan contable.")],
  ];

  const buffer = await writeExcelFile([
    { sheet: "Libro de ventas", data: ledgerData as never, stickyRowsCount: 3, columns: [12, 13, 12, 14, 16, 40, 20, 18, 16, 16, 20, 12, 40].map((width) => ({ width })) },
    { sheet: "Resumen", data: summary as never, columns: [22, 12, 22, 20, 18, 18, 22].map((width) => ({ width })) },
    { sheet: "Retenciones", data: retData as never, columns: [16, 45, 10, 20, 18].map((width) => ({ width })) },
    { sheet: "Asiento", data: journalData as never, columns: [12, 48, 22, 22].map((width) => ({ width })) },
  ]).toBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libro-ventas-${from}-${to}.xlsx"`,
    },
  });
}
