"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin, requireEditor } from "@/lib/session";
import { audit } from "@/lib/audit";
import { parseFile } from "@/lib/batch/parse";
import { buildInvoices, parseNumber, type RowError } from "@/lib/batch/build";
import { DEFAULT_COMMISSION_CONFIG, expandCommissionRows, type CommissionModelConfig } from "@/lib/batch/commission";
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
    let rows = await parseFile(file.name, await file.arrayBuffer());
    const db = await getDb();
    const [defaults, catalogs, products, customers] = await Promise.all([
      getSiigoDefaults(),
      getCatalogs(),
      db.select({ code: schema.products.code, taxIds: schema.products.taxIds }).from(schema.products),
      db
        .select({
          id: schema.customers.identification,
          name: schema.customers.name,
          personType: schema.customers.personType,
          idType: schema.customers.idType,
          siigoId: schema.customers.siigoId,
        })
        .from(schema.customers),
    ]);

    // Modelo de negocio: convierte el archivo propio (ej. dispersiones) en ítems estándar.
    const modelId = Number(fd.get("modelId")) || null;
    let params: Record<string, unknown> | null = null;
    const modelErrors: RowError[] = [];
    if (modelId) {
      const model = await db.query.businessModels.findFirst({ where: eq(schema.businessModels.id, modelId) });
      if (!model || !model.active) return { error: "El modelo de negocio no existe o está inactivo" };
      const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(model.config as Partial<CommissionModelConfig>) };
      const iva = catalogs?.taxes.find((t) => t.id === cfg.ivaTaxId);
      if (!iva) return { error: `El modelo "${model.name}" no tiene un IVA válido. Revísalo en Modelos de negocio.` };
      const pctRaw = String(fd.get("pct") ?? "").trim();
      const pct = pctRaw ? parseNumber(pctRaw.replace("%", "")) : cfg.defaultPct;
      if (pct === null || pct < 0 || pct > 100) return { error: "% de comisión inválido" };
      const companies = new Set(customers.filter((c) => c.personType === "Company" && c.idType === "31").map((c) => c.id));
      const exp = expandCommissionRows(rows, cfg, { pct, ivaPct: iva.percentage, today: todayBogota(), isColombianCompany: (n) => companies.has(n) });
      rows = exp.rows;
      modelErrors.push(...exp.errors);
      params = { modelo: model.name, comision_pct: pct, iva_incluido: cfg.ivaIncluded };
    }

    if (!modelId && !rows.some((r) => "referencia" in r || "producto_codigo" in r)) {
      const looksLikeMovements = rows.slice(0, 10).some(
        (r) =>
          Object.keys(r).some((k) => /identificacion|facturas_por_emitir|valor_a_facturar/.test(k)) ||
          Object.values(r).some((v) => typeof v === "string" && /identificaci[oó]n|facturas por emitir/i.test(v)),
      );
      return {
        error: looksLikeMovements
          ? "Este archivo es de movimientos (Facturas por emitir): súbelo en el menú Movimientos."
          : "El archivo no tiene las columnas del formato estándar (referencia, cliente_nit, producto_codigo…). Descarga la plantilla o elige un modelo.",
      };
    }

    const { invoices, errors: buildErrors } = buildInvoices(rows, {
      defaults,
      taxes: catalogs?.taxes ?? [],
      paymentTypes: catalogs?.paymentTypes ?? [],
      productTaxes: new Map(products.map((p) => [p.code, p.taxIds])),
      // Solo los clientes que existen en Siigo (los cargados desde movimientos aún pueden no estar)
      customers: new Map(customers.filter((c) => c.siigoId).map((c) => [c.id, c.name])),
      today: todayBogota(),
    });
    const errors = [...modelErrors, ...buildErrors].sort((a, b) => a.row - b.row);
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
        .values({ name, fileName: file.name, totalCount: invoices.length, totalAmount, rowErrors: errors, modelId, params, createdBy: user.id })
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
          personType: c.person_type ?? null,
          idType: c.id_type?.code ?? null,
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
    const { syncProductsFromSiigo } = await import("@/lib/sync");
    const count = await syncProductsFromSiigo();
    await audit(user, "siigo.sync_products", { count });
    revalidatePath("/app/productos");
    revalidatePath("/app/modelos");
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
    issuerCompany: String(fd.get("issuerCompany") ?? "").trim() || "JERO",
    newCustomerAddress: String(fd.get("newCustomerAddress") ?? "").trim() || "Sin dirección",
    newCustomerStateCode: String(fd.get("newCustomerStateCode") ?? "").trim() || "11",
    newCustomerCityCode: String(fd.get("newCustomerCityCode") ?? "").trim() || "11001",
    newCustomerEmail: String(fd.get("newCustomerEmail") ?? "").trim(),
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

// ---------- Modelos de negocio ----------

export async function saveCommissionModel(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = Number(fd.get("id")) || null;
  const name = String(fd.get("name") ?? "").trim();
  const text = (k: string) => String(fd.get(k) ?? "").trim();
  const num = (k: string) => (text(k) ? parseNumber(text(k)) : null);
  const config: CommissionModelConfig = {
    thirdPartyCode: text("thirdPartyCode"),
    thirdPartyDescription: text("thirdPartyDescription") || DEFAULT_COMMISSION_CONFIG.thirdPartyDescription,
    commissionCode: text("commissionCode"),
    commissionDescription: text("commissionDescription") || DEFAULT_COMMISSION_CONFIG.commissionDescription,
    ivaTaxId: num("ivaTaxId") ?? 0,
    ivaIncluded: fd.get("ivaIncluded") === "on",
    retentionTaxId: num("retentionTaxId"),
    defaultPct: num("defaultPct") ?? DEFAULT_COMMISSION_CONFIG.defaultPct,
    paymentId: num("paymentId"),
    roundToPeso: fd.get("roundToPeso") === "on",
  };
  if (!name) return { error: "Escribe un nombre para el modelo" };
  if (!config.thirdPartyCode || !config.commissionCode) return { error: "Indica los códigos de producto de terceros y de comisión" };
  if (!config.ivaTaxId) return { error: "Selecciona el IVA de la comisión" };
  if (config.defaultPct < 0 || config.defaultPct > 100) return { error: "% de comisión inválido" };
  const db = await getDb();
  if (id) {
    await db.update(schema.businessModels).set({ name, config }).where(eq(schema.businessModels.id, id));
  } else {
    await db.insert(schema.businessModels).values({ name, type: "commission", config });
  }
  await audit(user, id ? "model.update" : "model.create", { id, name, config });
  revalidatePath("/app/modelos");
  revalidatePath("/app/masiva");
  if (!id) redirect("/app/modelos");
  return { ok: "Modelo guardado" };
}

export async function toggleModel(id: number, active: boolean) {
  const user = await requireAdmin();
  const db = await getDb();
  await db.update(schema.businessModels).set({ active }).where(eq(schema.businessModels.id, id));
  await audit(user, "model.toggle", { id, active });
  revalidatePath("/app/modelos");
}

// ---------- Movimientos ----------

export async function importMovements(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireEditor();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Seleccione el archivo .xlsx o .csv" };
  if (file.size > 15 * 1024 * 1024) return { error: "El archivo supera 15 MB" };
  try {
    const { parseMovementRows } = await import("@/lib/movements");
    const rows = await parseFile(file.name, await file.arrayBuffer(), { headerKey: "identificacion" });
    const { movements, errors } = parseMovementRows(rows);
    if (movements.length === 0) {
      return { error: `No se encontraron movimientos. ${errors.slice(0, 3).map((e) => `Fila ${e.row}: ${e.message}`).join(" · ")}` };
    }
    const db = await getDb();
    const [imp] = await db
      .insert(schema.movementImports)
      .values({ fileName: file.name, rowCount: movements.length, createdBy: user.id })
      .returning();
    let inserted = 0;
    for (let i = 0; i < movements.length; i += 500) {
      const res = await db
        .insert(schema.movements)
        .values(movements.slice(i, i + 500).map((m) => ({ ...m, importId: imp.id, amount: m.amount.toFixed(2) })))
        .onConflictDoNothing()
        .returning({ id: schema.movements.id });
      inserted += res.length;
    }
    await db.update(schema.movementImports).set({ newCount: inserted }).where(eq(schema.movementImports.id, imp.id));
    // Los clientes del archivo quedan registrados en Jero; en Siigo se crean al emitir si no existen.
    const seen = new Set<string>();
    const customerRows = movements.filter((m) => !seen.has(m.identification) && seen.add(m.identification));
    for (let i = 0; i < customerRows.length; i += 500) {
      await db
        .insert(schema.customers)
        .values(
          customerRows.slice(i, i + 500).map((m) => ({
            identification: m.identification,
            branchOffice: 0,
            name: m.customerName,
            personType: m.personType,
            idType: m.personType === "Company" ? "31" : "13",
          })),
        )
        .onConflictDoNothing();
    }
    await audit(user, "movements.import", { file: file.name, rows: movements.length, inserted, errors: errors.length });
    revalidatePath("/app/movimientos");
    const skipped = movements.length - inserted;
    return {
      ok: `${inserted} movimientos cargados${skipped ? ` (${skipped} ya existían)` : ""}${errors.length ? ` · ${errors.length} filas con error` : ""}. ${seen.size} clientes.`,
    };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function emitMovementAction(movementId: number): Promise<ActionState> {
  const user = await requireEditor();
  try {
    const { emitMovement } = await import("@/lib/movements-emit");
    const number = await emitMovement(movementId, user.id);
    await audit(user, "movement.emit", { movementId, invoice: number });
    revalidatePath("/app/movimientos");
    return { ok: `Factura ${number} emitida` };
  } catch (e) {
    revalidatePath("/app/movimientos");
    return { error: errMsg(e) };
  }
}
