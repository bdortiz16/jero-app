import { creditNoteFileForDocument } from "@/lib/payments-lookup";

/** PDF de la nota crédito desde la consulta pública: solo para el documento de la solicitud. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const r = await creditNoteFileForDocument(Number((await params).id), url.searchParams.get("doc") ?? "");
  if (!r?.file) return new Response("Nota crédito no encontrada para ese documento.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const name = (r.name || `${r.number ?? "nota-credito"}.pdf`).replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(r.file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.has("descargar") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
