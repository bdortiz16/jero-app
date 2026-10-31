import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EmissionJob } from "@/db/schema";

/** Cuánto trabaja cada tanda antes de pasar el relevo (Vercel corta las funciones a los ~60 s). */
const SLICE_MS = 25_000;
/** Facturas en paralelo: rápido sin chocar con el límite de peticiones de Siigo. */
const PARALLEL = 2;
const LOG_SIZE = 40;

/** Firma para que solo el propio servidor pueda lanzar tandas. */
export function jobSignature(jobId: number) {
  const secret = process.env.ENCRYPTION_KEY || process.env.SUPABASE_ANON_KEY || process.env.DATABASE_URL || "jero";
  return createHash("sha256").update(`emission-job:${jobId}:${secret}`).digest("hex");
}

/** Pide al servidor que procese la siguiente tanda (responde de inmediato y trabaja en segundo plano). */
export async function kickJob(jobId: number, origin: string) {
  const base = (process.env.SITE_URL || origin).replace(/\/$/, "");
  try {
    await fetch(`${base}/api/jobs/emitir`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-job-signature": jobSignature(jobId) },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Si no se pudo lanzar, la siguiente visita a Movimientos o el botón Reanudar lo retoman.
  }
}

/** Trabajo en curso o el más reciente (para mostrarlo en Movimientos). */
export async function latestJob(): Promise<EmissionJob | null> {
  const db = await getDb();
  return (await db.query.emissionJobs.findFirst({ orderBy: desc(schema.emissionJobs.id) })) ?? null;
}

/** Un trabajo "running" sin señales de vida por más de 90 s se considera detenido (se puede retomar). */
export function isStalled(job: Pick<EmissionJob, "status" | "heartbeatAt" | "createdAt">) {
  if (job.status !== "running") return false;
  const last = job.heartbeatAt ?? job.createdAt;
  return Date.now() - new Date(last).getTime() > 90_000;
}

/**
 * Procesa una tanda del trabajo: toma el bloqueo, emite hasta agotar el tiempo de la tanda y
 * devuelve si quedan pendientes (para lanzar la siguiente).
 */
export async function runJobSlice(jobId: number): Promise<{ continue: boolean }> {
  const db = await getDb();
  // Bloqueo para que nunca haya dos tandas del mismo trabajo a la vez.
  const [job] = await db
    .update(schema.emissionJobs)
    .set({ lockedUntil: sql`now() + interval '75 seconds'`, heartbeatAt: new Date() })
    .where(
      and(
        eq(schema.emissionJobs.id, jobId),
        eq(schema.emissionJobs.status, "running"),
        or(isNull(schema.emissionJobs.lockedUntil), lt(schema.emissionJobs.lockedUntil, new Date())),
      ),
    )
    .returning();
  if (!job) return { continue: false };

  const { emitMovement } = await import("./movements-emit");
  const started = Date.now();
  let cursor = job.cursor;
  let ok = 0;
  let failed = 0;
  const results: EmissionJob["log"] = [];
  const names = new Map(
    (
      await db
        .select({ id: schema.movements.id, name: schema.movements.customerName, company: schema.movements.company, amount: schema.movements.amount })
        .from(schema.movements)
        .where(inArray(schema.movements.id, job.itemIds.slice(cursor, cursor + 400).length ? job.itemIds.slice(cursor, cursor + 400) : [-1]))
    ).map((m) => [m.id, m]),
  );

  const save = async (current: EmissionJob["current"], final = false) => {
    const [fresh] = await db.select({ status: schema.emissionJobs.status, log: schema.emissionJobs.log }).from(schema.emissionJobs).where(eq(schema.emissionJobs.id, jobId));
    const done = cursor >= job.itemIds.length;
    const log = [...results.splice(0).reverse(), ...(fresh?.log ?? [])].slice(0, LOG_SIZE);
    await db
      .update(schema.emissionJobs)
      .set({
        cursor,
        ok: sql`${schema.emissionJobs.ok} + ${ok}`,
        failed: sql`${schema.emissionJobs.failed} + ${failed}`,
        log,
        current,
        heartbeatAt: new Date(),
        workSeconds: sql`${schema.emissionJobs.workSeconds} + ${final ? Math.round((Date.now() - started) / 1000) : 0}`,
        ...(done && fresh?.status === "running" ? { status: "done", finishedAt: new Date(), current: [] } : {}),
        ...(final ? { lockedUntil: null } : {}),
      })
      .where(eq(schema.emissionJobs.id, jobId));
    ok = 0;
    failed = 0;
    return fresh?.status ?? "running";
  };

  let status = "running";
  // Si Siigo está caído, se detiene el trabajo en vez de marcar con error todo lo que queda.
  let unavailableInARow = 0;
  const inFlight = new Map<number, { id: number; name: string; text: string }>();
  const worker = async () => {
    while (status === "running" && cursor < job.itemIds.length && Date.now() - started < SLICE_MS) {
      const id = job.itemIds[cursor++];
      const m = names.get(id);
      const name = m?.name ?? `Movimiento ${id}`;
      inFlight.set(id, { id, name, text: m ? `${m.company} · $ ${Number(m.amount).toLocaleString("es-CO")}` : "" });
      try {
        const number = await emitMovement(id, job.createdBy ?? "");
        ok++;
        results.push({ id, name, status: "ok", text: number, at: new Date().toISOString() });
        unavailableInARow = 0;
      } catch (e) {
        const msg = (e as Error).message;
        // Ya facturado o en curso en otra parte: no es un error del lote.
        if (!/ya está facturado/.test(msg)) {
          failed++;
          results.push({ id, name, status: "error", text: msg.slice(0, 300), at: new Date().toISOString() });
        }
        unavailableInARow = /no está disponible en este momento/.test(msg) ? unavailableInARow + 1 : 0;
        if (unavailableInARow >= 3 && status === "running") {
          status = "cancelled";
          await db
            .update(schema.emissionJobs)
            .set({
              status: "cancelled",
              finishedAt: new Date(),
              error: "Siigo no está disponible en este momento: se detuvo la emisión. En unos minutos pulsa \"Reintentar los con error\" y luego \"Emitir masivamente\".",
            })
            .where(eq(schema.emissionJobs.id, jobId));
        }
      }
      inFlight.delete(id);
      const saved = await save([...inFlight.values()]);
      if (status === "running") status = saved;
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await save([], true);
  return { continue: status === "running" && cursor < job.itemIds.length };
}
