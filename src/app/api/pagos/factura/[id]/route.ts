import { getSiigo } from "@/lib/siigo";
import { invoiceOfDocument } from "@/lib/payments-lookup";

export const maxDuration = 60;

/**
 * PDF de una factura desde la consulta pública de pagos. Solo se entrega si la factura es del
 * documento consultado (?doc=): con el número de factura solo no se puede ver la de otro cliente.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const inv = await invoiceOfDocument(Number((await params).id), url.searchParams.get("doc") ?? "");
  if (!inv) return new Response("Factura no encontrada para ese documento.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const pdf = await (await getSiigo()).invoicePdf(inv.siigoId!);
    if (!pdf) return new Response("La factura aún no tiene PDF disponible. Intenta en unos minutos.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const file = `${inv.siigoNumber ?? `factura-${inv.id}`}.pdf`;
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.has("descargar") ? "attachment" : "inline"}; filename="${file}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("No pudimos obtener la factura en este momento. Intenta de nuevo en unos minutos.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
