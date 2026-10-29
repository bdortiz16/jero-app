import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSiigo, SiigoError } from "../siigo";
import { toSiigoRequest } from "./build";

const MAX_ATTEMPTS = 3;
const STALE_MS = 5 * 60_000;

/**
 * Envía a Siigo el siguiente bloque de facturas pendientes del lote.
 * Pensado para llamarse repetidamente (desde el navegador) hasta que no queden pendientes,
 * así funciona en entornos serverless con límite de tiempo por petición.
 */
export async function processBatchChunk(batchId: number, chunkSize = 5) {
  const db = await getDb();
  const siigo = await getSiigo();

  // Facturas que quedaron "procesando" por una caída: no sabemos si Siigo las creó, no reenviamos a ciegas.
  await db
    .update(schema.invoices)
    .set({ status: "error", error: "Estado incierto (interrumpido durante el envío). Verifique en Siigo antes de reintentar." })
    .where(
      and(
        eq(schema.invoices.batchId, batchId),
        eq(schema.invoices.status, "processing"),
        lt(schema.invoices.sentAt, new Date(Date.now() - STALE_MS)),
      ),
    );

  // Reclama el bloque de forma atómica para evitar envíos duplicados si hay dos pestañas procesando.
  const claimed = await db.execute(sql`
    update invoices set status = 'processing', attempts = attempts + 1, sent_at = now()
    where id in (
      select id from invoices where batch_id = ${batchId} and status = 'pending'
      order by id limit ${chunkSize} for update skip locked
    )
    returning id`);
  const ids = rowsOf<{ id: number }>(claimed).map((r) => Number(r.id));

  for (const id of ids) {
    const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
    if (!inv) continue;
    try {
      const res = await siigo.createInvoice(toSiigoRequest(inv.payload), `jero-invoice-${inv.id}`);
      await db
        .update(schema.invoices)
        .set({
          status: "sent",
          error: res.stamp?.errors || res.stamp?.observations || null,
          siigoId: res.id,
          siigoNumber: res.name,
          stampStatus: res.stamp?.status ?? null,
          cufe: res.stamp?.cufe ?? null,
          sentAt: new Date(),
        })
        .where(eq(schema.invoices.id, id));
    } catch (e) {
      const err = e as Error;
      const retry = e instanceof SiigoError && e.retryable && inv.attempts < MAX_ATTEMPTS;
      await db
        .update(schema.invoices)
        .set({ status: retry ? "pending" : "error", error: err.message.slice(0, 2000) })
        .where(eq(schema.invoices.id, id));
      // Si Siigo nos limita, cortamos este bloque y dejamos que el cliente reintente luego.
      if (e instanceof SiigoError && e.status === 429) break;
    }
  }

  return refreshBatchCounters(batchId);
}

export async function refreshBatchCounters(batchId: number) {
  const db = await getDb();
  const counts = rowsOf<{ status: string; n: number }>(
    await db.execute(
      sql`select status, count(*)::int as n from invoices where batch_id = ${batchId} group by status`,
    ),
  );
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  const pending = (by.pending ?? 0) + (by.processing ?? 0);
  const [batch] = await db
    .update(schema.invoiceBatches)
    .set({
      sentCount: by.sent ?? 0,
      errorCount: by.error ?? 0,
      ...(pending === 0 ? { status: "done", finishedAt: new Date() } : {}),
    })
    .where(and(eq(schema.invoiceBatches.id, batchId), sql`status <> 'cancelled'`))
    .returning();
  return { batch, pending, sent: by.sent ?? 0, errors: by.error ?? 0 };
}

/** postgres-js devuelve un arreglo; PGlite un objeto con `rows`. */
export function rowsOf<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);
}
