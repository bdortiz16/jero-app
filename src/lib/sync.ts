import "server-only";
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
    for (const p of results) {
      const price = p.prices?.[0]?.price_list?.[0]?.value;
      const values = {
        siigoId: p.id,
        code: p.code,
        name: p.name,
        price: typeof price === "number" ? price.toFixed(2) : null,
        taxIds: (p.taxes ?? []).map((t) => t.id),
        active: p.active ?? true,
        syncedAt: new Date(),
      };
      await db.insert(schema.products).values(values).onConflictDoUpdate({ target: schema.products.code, set: values });
      count++;
    }
    const size = r?.pagination?.page_size ?? 100;
    const total = r?.pagination?.total_results ?? 0;
    if (results.length === 0 || results.length < size || page * size >= total || page >= 50) break;
    page++;
  }
  return count;
}
