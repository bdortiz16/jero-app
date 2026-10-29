"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin, requireEditor } from "@/lib/session";
import { audit } from "@/lib/audit";
import { parseFile } from "@/lib/batch/parse";
import { buildInvoices } from "@/lib/batch/build";
import { getCatalogs, getSiigo, refreshCatalogs } from "@/lib/siigo";
import { getSiigoDefaults, saveSiigoCredentials, setSetting, type SiigoDefaults } from "@/lib/settings";
import { todayBogota } from "@/lib/format";

export type ActionState = { ok?: string; error?: string } | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- Facturación masiva ----------

export async function uploadBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireEditor();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Seleccione un archivo .csv o .xlsx" };
  if (file.size > 8 * 1024 * 1024) return { error: "El archivo supera 8 MB" };

  let batchId: number;
  try {
    const rows = await parseFile(file.name, await file.arrayBuffer());
    const db = await getDb();
    const [defaults, catalogs, products, customers] = await Promise.all([
      getSiigoDefaults(),
      getCatalogs(),
      db.select({ code: schema.products.code, taxIds: schema.products.taxIds }).from(schema.products),
      db.select({ id: schema.customers.identification, name: schema.customers.name }).from(schema.customers),
    ]);
    const { invoices, errors } = buildInvoices(rows, {
      defaults,
      taxes: catalogs?.taxes ?? [],
      paymentTypes: catalogs?.paymentTypes ?? [],
      productTaxes: new Map(products.map((p) => [p.code, p.taxIds])),
      customers: new Map(customers.map((c) => [c.id, c.name])),
      today: todayBogota(),
    });
    // Evita facturar dos veces: una referencia ya emitida o en curso en otro lote se rechaza.
    const refs = invoices.map((i) => i.reference);
    const dupes = refs.length
      ? await db
          .select({ reference: schema.invoices.reference, batchId: schema.invoices.batchId })
          .from(schema.invoices)
          .where(and(inArray(schema.invoices.reference, refs), inArray(schema.invoices.status, ["pending", "processing", "sent"])))
      : [];
    if (dupes.length) {
      const seen = new Map(dupes.map((d) => [d.reference, d.batchId]));
      for (let i = invoices.length - 1; i >= 0; i--) {
        const inv = invoices[i];
        if (seen.has(inv.reference)) {
          errors.push({ row: inv.rows[0], reference: inv.reference, message: `La referencia ya existe en el lote #${seen.get(inv.reference)}` });
          invoices.splice(i, 1);
        }
      }
      errors.sort((a, b) => a.row - b.row);
    }
    if (invoices.length === 0) {
      const first = errors.slice(0, 5).map((e) => (e.row ? `Fila ${e.row}: ${e.message}` : e.message));
      return { error: `No hay facturas válidas en el archivo. ${first.join(" · ")}` };
    }

    const name = String(fd.get("name") || "").trim() || `${file.name} (${todayBogota()})`;
    const totalAmount = invoices.reduce((s, i) => s + i.total, 0).toFixed(2);
    batchId = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(schema.invoiceBatches)
        .values({ name, fileName: file.name, totalCount: invoices.length, totalAmount, rowErrors: errors, createdBy: user.id })
        .returning({ id: schema.invoiceBatches.id });
      for (let i = 0; i < invoices.length; i += 200) {
        await tx.insert(schema.invoices).values(
          invoices.slice(i, i + 200).map((inv) => ({
            batchId: batch.id,
            reference: inv.reference,
            date: inv.payload.date,
            customerIdentification: inv.payload.customer.identification,
            customerName: inv.customerName,
            payload: inv.payload,
            subtotal: inv.subtotal.toFixed(2),
            taxTotal: inv.taxTotal.toFixed(2),
            retentionTotal: inv.retentionTotal.toFixed(2),
            total: inv.total.toFixed(2),
            createdBy: user.id,
          })),
        );
      }
      return batch.id;
    });
    await audit(user, "batch.upload", { batchId, file: file.name, invoices: invoices.length, rejectedRows: errors.length });
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/app/masiva/${batchId}`);
}

export async function startBatch(batchId: number) {
  const user = await requireEditor();
  const db = await getDb();
  await db
    .update(schema.invoiceBatches)
    .set({ status: "processing" })
    .where(and(eq(schema.invoiceBatches.id, batchId), eq(schema.invoiceBatches.status, "draft")));
  await audit(user, "batch.start", { batchId });
  revalidatePath(`/app/masiva/${batchId}`);
}

export async function retryBatchErrors(batchId: number) {
  const user = await requireEditor();
  const db = await getDb();
  const updated = await db
    .update(schema.invoices)
    .set({ status: "pending", error: null })
    .where(and(eq(schema.invoices.batchId, batchId), eq(schema.invoices.status, "error")))
    .returning({ id: schema.invoices.id });
  await db
    .update(schema.invoiceBatches)
    .set({ status: "processing", finishedAt: null })
    .where(eq(schema.invoiceBatches.id, batchId));
  await audit(user, "batch.retry", { batchId, invoices: updated.length });
  revalidatePath(`/app/masiva/${batchId}`);
}

export async function cancelBatch(batchId: number) {
  const user = await requireEditor();
  const db = await getDb();
  const [b] = await db
    .update(schema.invoiceBatches)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(schema.invoiceBatches.id, batchId), inArray(schema.invoiceBatches.status, ["draft", "processing"])))
    .returning();
  if (b) {
    // Solo se descartan las que no se han enviado.
    await db
      .delete(schema.invoices)
      .where(and(eq(schema.invoices.batchId, batchId), eq(schema.invoices.status, "pending")));
    await audit(user, "batch.cancel", { batchId });
  }
  revalidatePath("/app/masiva");
  revalidatePath(`/app/masiva/${batchId}`);
}

// ---------- Sincronización con Siigo ----------

export async function syncCustomers(): Promise<ActionState> {
  const user = await requireEditor();
  try {
    const siigo = await getSiigo();
    const db = await getDb();
    let page = 1;
    let count = 0;
    for (;;) {
      const r = await siigo.customers(page, 100);
      for (const c of r.results) {
        const values = {
          siigoId: c.id,
          identification: c.identification,
          branchOffice: c.branch_office ?? 0,
          name: (c.commercial_name || c.name.join(" ")).trim(),
          email: c.contacts?.find((x) => x.email)?.email ?? null,
          phone: c.phones?.[0]?.number ?? null,
          city: c.address?.city?.city_name ?? null,
          active: c.active,
          syncedAt: new Date(),
        };
        await db
          .insert(schema.customers)
          .values(values)
          .onConflictDoUpdate({ target: [schema.customers.identification, schema.customers.branchOffice], set: values });
        count++;
      }
      if (r.results.length === 0 || page * r.pagination.page_size >= r.pagination.total_results) break;
      page++;
    }
    await audit(user, "siigo.sync_customers", { count });
    revalidatePath("/app/clientes");
    return { ok: `${count} clientes sincronizados` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function syncProducts(): Promise<ActionState> {
  const user = await requireEditor();
  try {
    const siigo = await getSiigo();
    const db = await getDb();
    let page = 1;
    let count = 0;
    for (;;) {
      const r = await siigo.products(page, 100);
      for (const p of r.results) {
        const price = p.prices?.[0]?.price_list?.[0]?.value;
        const values = {
          siigoId: p.id,
          code: p.code,
          name: p.name,
          price: price !== undefined ? price.toFixed(2) : null,
          taxIds: (p.taxes ?? []).map((t) => t.id),
          active: p.active,
          syncedAt: new Date(),
        };
        await db.insert(schema.products).values(values).onConflictDoUpdate({ target: schema.products.code, set: values });
        count++;
      }
      if (r.results.length === 0 || page * r.pagination.page_size >= r.pagination.total_results) break;
      page++;
    }
    await audit(user, "siigo.sync_products", { count });
    revalidatePath("/app/productos");
    return { ok: `${count} productos sincronizados` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------- Administración ----------

export async function saveSiigoConnection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const username = String(fd.get("username") ?? "").trim();
  const accessKey = String(fd.get("accessKey") ?? "").trim();
  const partnerId = String(fd.get("partnerId") ?? "").trim();
  if (!username || !accessKey || !partnerId) return { error: "Complete usuario, access key y Partner-Id" };
  if (!/^[A-Za-z0-9]{3,100}$/.test(partnerId)) return { error: "El Partner-Id debe ser alfanumérico (3 a 100 caracteres)" };
  try {
    await saveSiigoCredentials({ username, accessKey, partnerId });
  } catch (e) {
    return { error: `No se pudieron guardar las credenciales: ${errMsg(e)}` };
  }
  try {
    const siigo = await getSiigo();
    await siigo.testConnection();
    await refreshCatalogs();
    await audit(user, "siigo.credentials_saved", { username, partnerId });
    revalidatePath("/app/admin/siigo");
    return { ok: "Conexión exitosa. Catálogos actualizados." };
  } catch (e) {
    return { error: `Credenciales guardadas, pero la conexión falló: ${errMsg(e)}` };
  }
}

export async function reloadCatalogs(): Promise<ActionState> {
  await requireAdmin();
  try {
    await refreshCatalogs();
    revalidatePath("/app/admin/siigo");
    return { ok: "Catálogos actualizados" };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function saveDefaults(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
  const defaults: SiigoDefaults = {
    documentId: num("documentId"),
    sellerId: num("sellerId"),
    paymentId: num("paymentId"),
    costCenterId: num("costCenterId"),
    dueDays: Math.max(0, Number(fd.get("dueDays") ?? 30) || 0),
    sendStamp: fd.get("sendStamp") === "on",
    sendMail: fd.get("sendMail") === "on",
  };
  await setSetting("siigo:defaults", defaults);
  await audit(user, "siigo.defaults_saved", defaults);
  revalidatePath("/app/admin/siigo");
  return { ok: "Valores predeterminados guardados" };
}

export async function updateUser(userId: string, patch: { role?: string; status?: string }) {
  const admin = await requireAdmin();
  if (userId === admin.id && (patch.status && patch.status !== "active" || patch.role && patch.role !== "ADMIN")) {
    throw new Error("No puedes quitarte el acceso de administrador a ti mismo");
  }
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role && ["ADMIN", "CONTADOR", "USUARIO"].includes(patch.role)) set.role = patch.role;
  if (patch.status && ["pending", "active", "disabled"].includes(patch.status)) set.status = patch.status;
  if (!Object.keys(set).length) return;
  const db = await getDb();
  await db.update(schema.users).set(set).where(eq(schema.users.id, userId));
  await audit(admin, "user.update", { userId, ...set });
  revalidatePath("/app/admin/usuarios");
}
