import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { isStalled, jobSignature, kickJob, runJobSlice } from "@/lib/emission-jobs";

// Cada tanda trabaja ~40 s; se deja margen para guardar y lanzar la siguiente.
export const maxDuration = 60;

/** Lanza una tanda del trabajo (solo lo llama el propio servidor). Responde de inmediato y trabaja en segundo plano. */
export async function POST(req: Request) {
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: number };
  if (!jobId || req.headers.get("x-job-signature") !== jobSignature(jobId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const origin = new URL(req.url).origin;
  after(async () => {
    const res = await runJobSlice(jobId).catch(async (e) => {
      const db = await getDb();
      await db.update(schema.emissionJobs).set({ error: (e as Error).message.slice(0, 500), lockedUntil: null }).where(eq(schema.emissionJobs.id, jobId));
      return { continue: true };
    });
    // Relevo: la siguiente tanda corre en una función nueva.
    if (res.continue) await kickJob(jobId, origin);
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

/** Estado del trabajo para la pantalla (requiere sesión). Si quedó detenido, lo retoma. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const db = await getDb();
  const job = await db.query.emissionJobs.findFirst({ where: eq(schema.emissionJobs.id, id) });
  if (!job) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const stalled = isStalled(job);
  if (stalled && user.role !== "USUARIO") {
    const origin = new URL(req.url).origin;
    after(() => kickJob(job.id, origin));
  }
  const { itemIds: _ids, ...rest } = job;
  return NextResponse.json({ ...rest, stalled });
}
