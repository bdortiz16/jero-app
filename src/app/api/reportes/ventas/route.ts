import { auth } from "@/auth";
import { salesLedger } from "@/lib/reports";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita inyección de fórmulas al abrir en Excel
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.status !== "active") return new Response("No autorizado", { status: 403 });
  const url = new URL(req.url);
  const from = url.searchParams.get("desde") ?? "2000-01-01";
  const to = url.searchParams.get("hasta") ?? "2999-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Fechas inválidas", { status: 400 });
  const rows = await salesLedger(from, to);
  const header = ["Fecha", "Factura", "Referencia", "NIT cliente", "Cliente", "Subtotal", "IVA", "Retenciones", "Total", "Estado DIAN", "CUFE"];
  const lines = rows.map((r) =>
    [r.date, r.siigo_number, r.reference, r.customer_identification, r.customer_name, r.subtotal, r.tax_total, r.retention_total, r.total, r.stamp_status, r.cufe]
      .map(csvCell)
      .join(";"),
  );
  return new Response("﻿" + [header.join(";"), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-ventas-${from}-${to}.csv"`,
    },
  });
}
