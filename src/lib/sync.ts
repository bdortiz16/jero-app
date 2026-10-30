import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSiigo } from "./siigo";

/** Trae todos los productos de Siigo y los guarda en Jero. Devuelve cuántos sincronizó. */
export async function syncProductsFromSiigo(): Promise<number> {
  const siigo = await getSiigo();
  const db = await getDb();
  let page = 1;
  let count = 0;
  for (;;) {
    const r = await siigo.products(page, 100);
    const results = r?.results ?? [];
    // Un solo INSERT por página (Siigo puede devolver códigos repetidos: se queda el último).
    const byCode = new Map(
      results.map((p) => {
        const price = p.prices?.[0]?.price_list?.[0]?.value;
        return [
          p.code,
          {
            siigoId: p.id,
            code: p.code,
            name: p.name,
            price: typeof price === "number" ? price.toFixed(2) : null,
            taxIds: (p.taxes ?? []).map((t) => t.id),
            active: p.active ?? true,
            syncedAt: new Date(),
          },
        ] as const;
      }),
    );
    if (byCode.size) {
      await db
        .insert(schema.products)
        .values([...byCode.values()])
        .onConflictDoUpdate({
          target: schema.products.code,
          set: {
            siigoId: sql`excluded.siigo_id`,
            name: sql`excluded.name`,
            price: sql`excluded.price`,
            taxIds: sql`excluded.tax_ids`,
            active: sql`excluded.active`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
    count += byCode.size;
    const size = r?.pagination?.page_size ?? 100;
    const total = r?.pagination?.total_results ?? 0;
    if (results.length === 0 || results.length < size || page * size >= total || page >= 50) break;
    page++;
  }
  return count;
}
