import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { getSiigo } from "@/lib/siigo";

export const maxDuration = 60;

/** PDF de la factura tal como lo genera Siigo. ?descargar=1 lo descarga; sin él, se abre en el navegador. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const id = Number((await params).id);
  const db = await getDb();
  const inv = Number.isInteger(id) ? await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) }) : null;
  if (!inv?.siigoId) return new Response("Factura no encontrada o aún no emitida en Siigo", { status: 404 });
  try {
    const pdf = await (await getSiigo()).invoicePdf(inv.siigoId);
    if (!pdf) return new Response("Siigo no entregó el PDF de esta factura todavía. Intenta en unos minutos.", { status: 502 });
    const download = new URL(req.url).searchParams.has("descargar");
    const file = `${inv.siigoNumber ?? `factura-${inv.id}`}.pdf`;
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return new Response(`No se pudo obtener el PDF de Siigo: ${(e as Error).message}`, { status: 502 });
  }
}
