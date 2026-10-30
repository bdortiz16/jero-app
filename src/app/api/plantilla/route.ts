import { COLUMNS } from "@/lib/batch/build";
import { COMMISSION_COLUMNS } from "@/lib/batch/commission";

export function GET(req: Request) {
  const commission = new URL(req.url).searchParams.get("modelo") === "comision";
  const header = (commission ? COMMISSION_COLUMNS : COLUMNS).map((c) => c.key).join(";");
  const example = commission
    ? [
        "900123456;400000000;2026-10-30;OP-1001;Pago proveedor factura 553;;;",
        "1020304050;2500000;2026-10-30;OP-1002;;;;",
      ]
    : [
        "F-001;2026-10-29;900123456;0;SERV-01;Asesoría octubre;1;850000;0;;;;;;Servicio mes de octubre",
        "F-001;2026-10-29;900123456;0;PROD-01;;2;35000;0;;;;;;",
        "F-002;2026-10-29;1020304050;0;SERV-02;;1;450000;50000;;;;;;",
      ];
  // BOM para que Excel abra bien las tildes
  const csv = "\uFEFF" + [header, ...example].join("\r\n") + "\r\n";
  const file = commission ? "plantilla-dispersiones-jero.csv" : "plantilla-facturacion-jero.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
