import { COLUMNS } from "@/lib/batch/build";

export function GET() {
  const header = COLUMNS.map((c) => c.key).join(";");
  const example = [
    "F-001;2026-10-29;900123456;0;SERV-01;Asesoría octubre;1;850000;0;;;;;;Servicio mes de octubre",
    "F-001;2026-10-29;900123456;0;PROD-01;;2;35000;0;;;;;;",
    "F-002;2026-10-29;1020304050;0;SERV-02;;1;450000;50000;;;;;;",
  ];
  // BOM para que Excel abra bien las tildes
  const csv = "﻿" + [header, ...example].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-facturacion-jero.csv"',
    },
  });
}
