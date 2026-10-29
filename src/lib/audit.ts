import "server-only";
import { getDb, schema } from "@/db";

export async function audit(user: { id: string; email: string } | null, action: string, detail?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    action,
    detail: detail ?? null,
  });
}
