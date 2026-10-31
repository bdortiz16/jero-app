import { getSessionUser } from "@/lib/auth";
import { retentionsByCustomer, salesLedgerDetailed, accountingSummary } from "@/lib/reports";
import { activeModel } from "@/lib/movements-emit";
import { DEFAULT_COMMISSION_CONFIG } from "@/lib/batch/commission";
import { journalEntry, sumRows } from "@/lib/accounting";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")) : String(v);
  // Evita inyección de fórmulas al abrir en Excel
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s.replace(",", "."))) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (v: unknown) => Number(v ?? 0);

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const url = new URL(req.url);
  const from = url.searchParams.get("desde") ?? "2000-01-01";
  const to = url.searchParams.get("hasta") ?? "2999-12-31";
  const tipo = url.searchParams.get("tipo") ?? "ventas";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Fechas inválidas", { status: 400 });
  const code = (await activeModel())?.cfg.thirdPartyCode ?? DEFAULT_COMMISSION_CONFIG.thirdPartyCode;

  let name: string;
  let header: string[];
  let data: unknown[][];
  if (tipo === "retenciones") {
    name = "retenciones-por-cliente";
    header = ["NIT cliente", "Cliente", "Facturas", "Base (comisión)", "Retención"];
    data = (await retentionsByCustomer(from, to, code)).map((r) => [r.identification, r.name, r.count, r.base, r.retention]);
  } else if (tipo === "asiento") {
    name = "asiento-contable";
    header = ["Cuenta", "Nombre", "Débito", "Crédito"];
    data = journalEntry(sumRows(await accountingSummary(from, to, code))).map((l) => [l.account, l.name, l.debit, l.credit]);
  } else {
    name = "libro-ventas";
    header = ["Fecha", "Factura", "Referencia", "Empresa", "NIT cliente", "Cliente", "Para terceros", "Comisión (base)", "IVA", "Retención", "Total", "Estado DIAN", "CUFE"];
    data = (await salesLedgerDetailed(from, to, code)).map((r) => [
      r.date, r.siigo_number, r.reference, r.company, r.customer_identification, r.customer_name,
      num(r.third_party), num(r.commission), num(r.tax_total), num(r.retention_total), num(r.total), r.stamp_status, r.cufe,
    ]);
  }
  const lines = data.map((row) => row.map(csvCell).join(";"));
  return new Response("﻿" + [header.join(";"), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${from}-${to}.csv"`,
    },
  });
}
