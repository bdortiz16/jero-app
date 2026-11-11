import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";

/** PDF adjunto de una solicitud de nota crédito (para el equipo, con sesión). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return new Response("No autorizado", { status: 403 });
  const db = await getDb();
  const T = schema.creditNoteRequests;
  const [r] = await db.select({ file: T.creditNoteFile, name: T.creditNoteFileName }).from(T).where(eq(T.id, Number((await params).id))).limit(1);
  if (!r?.file) return new Response("Sin archivo", { status: 404 });
  return new Response(new Uint8Array(r.file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${(r.name ?? "nota-credito.pdf").replace(/[^\w.\- ]/g, "_")}"` },
  });
}
