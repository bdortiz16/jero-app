import writeExcelFile from "write-excel-file/node";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { CREDIT_NOTE_STATUS } from "@/lib/credit-note-options";

/** Excel de las solicitudes de nota crédito (con el filtro de la pestaña) para el contador. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const estado = new URL(req.url).searchParams.get("estado") ?? "abiertas";
  const T = schema.creditNoteRequests;
  const I = schema.invoices;
  const where: SQL | undefined =
    estado === "abiertas" ? sql`${T.status} in ('pendiente', 'en_revision')` : estado in CREDIT_NOTE_STATUS ? eq(T.status, estado) : undefined;
  const db = await getDb();
  const rows = await db
    .select({
      createdAt: T.createdAt, status: T.status, invoiceNumber: T.invoiceNumber, beneficiary: T.beneficiary, identification: T.identification,
      contactName: T.contactName, email: T.email, phone: T.phone, reason: T.reason, detail: T.detail,
      creditNoteNumber: T.creditNoteNumber, creditNoteAt: T.creditNoteAt, clientMessage: T.clientMessage, adminNote: T.adminNote,
      invDate: I.date, subtotal: I.subtotal, tax: I.taxTotal, retention: I.retentionTotal, total: I.total, cufe: I.cufe,
    })
    .from(T)
    .leftJoin(I, eq(I.id, T.invoiceId))
    .where(where)
    .orderBy(desc(T.createdAt));

  const fecha = (d: Date | null) => (d ? d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "");
  const H = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0F3D2E", textColor: "#FFFFFF", wrap: true });
  const S = (v: unknown) => ({ value: v === null || v === undefined ? "" : String(v), type: String, wrap: true });
  const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : { value: Number(v), type: Number, format: "#,##0.00" });
  const header = [
    "Fecha solicitud", "Estado", "Factura", "Fecha factura", "Base (subtotal)", "IVA", "Retención", "Total factura", "CUFE",
    "Cliente", "Identificación", "Contacto", "Correo", "Celular", "Motivo", "Detalle del cliente",
    "N.º nota crédito", "Fecha nota crédito", "Respuesta al cliente", "Nota interna",
  ].map(H);
  const data = [
    header,
    ...rows.map((r) => [
      S(fecha(r.createdAt)), S(CREDIT_NOTE_STATUS[r.status]?.label ?? r.status), S(r.invoiceNumber), S(r.invDate),
      N(r.subtotal), N(r.tax), N(r.retention), N(r.total), S(r.cufe),
      S(r.beneficiary), S(r.identification), S(r.contactName), S(r.email), S(r.phone), S(r.reason), S(r.detail),
      S(r.creditNoteNumber), S(fecha(r.creditNoteAt)), S(r.clientMessage), S(r.adminNote),
    ]),
  ];
  const buffer = await writeExcelFile(data as never, {
    sheet: "Notas crédito",
    stickyRowsCount: 1,
    columns: [16, 16, 13, 12, 16, 14, 14, 16, 30, 30, 15, 22, 26, 14, 30, 60, 15, 16, 40, 40].map((width) => ({ width })),
  }).toBuffer();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="notas-credito-${estado}-${hoy}.xlsx"`,
    },
  });
}
