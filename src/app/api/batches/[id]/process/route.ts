import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";
import { processBatchChunk } from "@/lib/batch/process";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user;
  if (!u || u.status !== "active" || !["ADMIN", "CONTADOR"].includes(u.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const id = Number((await params).id);
  const db = await getDb();
  const batch = await db.query.invoiceBatches.findFirst({ where: eq(schema.invoiceBatches.id, id) });
  if (!batch) return NextResponse.json({ error: "Lote no existe" }, { status: 404 });
  if (batch.status !== "processing") return NextResponse.json({ status: batch.status, pending: 0 });
  try {
    const r = await processBatchChunk(id);
    return NextResponse.json({ status: r.batch?.status ?? batch.status, pending: r.pending, sent: r.sent, errors: r.errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
