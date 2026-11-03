import { getSessionUser } from "@/lib/auth";
import { buildSupportZip, SUPPORT_MAX, supportMovements } from "@/lib/support-pack";

export const maxDuration = 60;

/** ZIP con el movimiento y su factura. ?id=… (uno o varios separados por coma) o los filtros de la lista. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const p = new URL(req.url).searchParams;
  const ids = p.get("id")?.split(",").map(Number).filter(Number.isInteger);
  const rows = await supportMovements(
    ids ? { ids } : { filters: { q: p.get("q") ?? "", empresa: p.get("empresa") ?? "", estado: p.get("estado") ?? "", min: p.get("min") ?? "", max: p.get("max") ?? "", orden: p.get("orden") ?? "" } },
  );
  if (!rows.length) return new Response("No hay movimientos con ese filtro.", { status: 404 });
  if (rows.length > SUPPORT_MAX) {
    return new Response(`Son más de ${SUPPORT_MAX} movimientos: filtra más (por cliente, empresa o valor) y vuelve a descargar.`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const zip = await buildSupportZip(rows);
  const name = rows.length === 1 ? `movimiento-${rows[0].m.rowNumber ?? rows[0].m.id}-${rows[0].inv?.siigoNumber ?? "sin-factura"}` : `soportes-${rows.length}-movimientos`;
  return new Response(zip as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"` },
  });
}
