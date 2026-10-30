import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Movement } from "@/db/schema";
import { effectiveDefaults, getCatalogs, getSiigo, type SiigoApi } from "./siigo";
import { companyAllowed, getSiigoDefaults, noteForCompany, type SiigoDefaults } from "./settings";
import { buildInvoices, toSiigoRequest } from "./batch/build";
import { DEFAULT_COMMISSION_CONFIG, expandCommissionRows, type CommissionModelConfig } from "./batch/commission";
import { siigoName } from "./movements";
import { todayBogota } from "./format";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : "?");

/** Modelo de negocio activo con el que se facturan los movimientos (el primero activo). */
export async function activeModel() {
  const db = await getDb();
  const model = await db.query.businessModels.findFirst({
    where: eq(schema.businessModels.active, true),
    orderBy: asc(schema.businessModels.id),
  });
  if (!model) return null;
  return { ...model, cfg: { ...DEFAULT_COMMISSION_CONFIG, ...(model.config as Partial<CommissionModelConfig>) } };
}

/** Busca el cliente en Siigo y, si no existe, lo crea con los datos del movimiento. */
async function ensureCustomer(siigo: SiigoApi, m: Movement, defaults: SiigoDefaults) {
  const db = await getDb();
  let customer = await siigo.findCustomer(m.identification);
  if (!customer) {
    const names = siigoName(m.customerName, m.personType as "Person" | "Company");
    customer = await siigo.createCustomer({
      type: "Customer",
      person_type: m.personType as "Person" | "Company",
      id_type: m.personType === "Company" ? "31" : "13",
      identification: m.identification,
      ...(m.checkDigit ? { check_digit: m.checkDigit } : {}),
      name: names,
      branch_office: 0,
      active: true,
      vat_responsible: false,
      fiscal_responsibilities: [{ code: "R-99-PN" }],
      address: {
        address: defaults.newCustomerAddress,
        city: { country_code: "Co", state_code: defaults.newCustomerStateCode, city_code: defaults.newCustomerCityCode },
      },
      ...(defaults.newCustomerEmail
        ? { contacts: [{ first_name: names[0], last_name: names[1] ?? names[0], email: defaults.newCustomerEmail }] }
        : {}),
    });
  }
  const values = {
    siigoId: customer.id,
    identification: customer.identification,
    branchOffice: customer.branch_office ?? 0,
    name: (customer.commercial_name || customer.name.join(" ")).trim() || m.customerName,
    personType: customer.person_type ?? m.personType,
    idType: customer.id_type?.code ?? (m.personType === "Company" ? "31" : "13"),
    active: customer.active,
    syncedAt: new Date(),
  };
  await db
    .insert(schema.customers)
    .values(values)
    .onConflictDoUpdate({ target: [schema.customers.identification, schema.customers.branchOffice], set: values });
  return values;
}

/**
 * Emite en Siigo la factura de un movimiento con el modelo activo (terceros + comisión).
 * Devuelve el número de factura de Siigo. El movimiento queda "facturado" o con el error de Siigo.
 */
export async function emitMovement(movementId: number, userId: string): Promise<string> {
  const db = await getDb();
  // Reclamo atómico: evita doble emisión por doble clic o dos usuarios a la vez.
  const [m] = await db
    .update(schema.movements)
    .set({ status: "emitiendo", error: null })
    .where(and(eq(schema.movements.id, movementId), inArray(schema.movements.status, ["pendiente", "error"])))
    .returning();
  if (!m) throw new Error("Este movimiento ya está facturado o se está emitiendo.");

  const fail = async (message: string) => {
    await db.update(schema.movements).set({ status: "error", error: message.slice(0, 2000) }).where(eq(schema.movements.id, m.id));
    return new Error(message);
  };

  try {
    const defaults = await getSiigoDefaults();
    if (!companyAllowed(m.company, defaults.issuerCompanies)) {
      throw await fail(`Los movimientos de "${m.company}" no están habilitados para esta conexión de Siigo (Conexión Siigo → Movimientos).`);
    }
    const model = await activeModel();
    if (!model) throw await fail("No hay un modelo de negocio activo. Créalo en Modelos de negocio.");
    const catalogs = await getCatalogs();
    const iva = catalogs?.taxes.find((t) => t.id === model.cfg.ivaTaxId);
    if (!iva) throw await fail(`El modelo "${model.name}" no tiene un IVA válido.`);

    const siigo = await getSiigo();
    let customer;
    try {
      customer = await ensureCustomer(siigo, m, defaults);
    } catch (e) {
      throw await fail(`No se pudo crear el cliente en Siigo: ${(e as Error).message}`);
    }

    const today = todayBogota();
    const exp = expandCommissionRows(
      [{ cliente_nit: m.identification, valor_dispersado: Number(m.amount), fecha: today, id_operacion: `MOV-${m.id}` }],
      model.cfg,
      {
        pct: model.cfg.defaultPct,
        ivaPct: iva.percentage,
        today,
        isColombianCompany: () => customer.personType === "Company" && customer.idType === "31",
      },
    );
    const { invoices, errors } = buildInvoices(exp.rows, {
      defaults: effectiveDefaults(defaults, catalogs),
      taxes: catalogs?.taxes ?? [],
      paymentTypes: catalogs?.paymentTypes ?? [],
      productTaxes: new Map(),
      customers: new Map([[m.identification, customer.name]]),
      today,
    });
    const built = invoices[0];
    if (!built) throw await fail([...exp.errors, ...errors].map((e) => e.message).join(" · ") || "No se pudo armar la factura");
    // Leyenda de la empresa (ej. contrato de mandato KAUPALOKI–JERO): en la descripción del ítem de terceros y en observaciones.
    const note = noteForCompany(m.company, defaults.companyNotes);
    if (note) {
      const third = built.payload.items.find((i) => i.code === model.cfg.thirdPartyCode) ?? built.payload.items[0];
      third.description = `${third.description ?? model.cfg.thirdPartyDescription}. ${note}`;
    }
    built.payload.observations =
      (note ? `${note} ` : "") +
      `${m.company} · Retiros del ${day(m.dateFrom)} al ${day(m.dateTo)}` +
      (m.withdrawals ? ` (${m.withdrawals} retiros)` : "") +
      ` · Movimiento ${m.rowNumber ?? m.id}`;

    const [inv] = await db
      .insert(schema.invoices)
      .values({
        reference: built.reference,
        date: built.payload.date,
        customerIdentification: m.identification,
        customerName: customer.name,
        payload: built.payload,
        subtotal: built.subtotal.toFixed(2),
        taxTotal: built.taxTotal.toFixed(2),
        retentionTotal: built.retentionTotal.toFixed(2),
        total: built.total.toFixed(2),
        status: "processing",
        attempts: 1,
        sentAt: new Date(),
        createdBy: userId,
      })
      .returning();
    await db.update(schema.movements).set({ invoiceId: inv.id }).where(eq(schema.movements.id, m.id));

    try {
      const res = await siigo.createInvoice(toSiigoRequest(built.payload), `jero-invoice-${inv.id}`);
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
        .where(eq(schema.invoices.id, inv.id));
      await db.update(schema.movements).set({ status: "facturado", error: null }).where(eq(schema.movements.id, m.id));
      return res.name;
    } catch (e) {
      const msg = (e as Error).message;
      await db.update(schema.invoices).set({ status: "error", error: msg.slice(0, 2000) }).where(eq(schema.invoices.id, inv.id));
      throw await fail(`Siigo rechazó la factura: ${msg}`);
    }
  } catch (e) {
    // Errores no previstos: el movimiento no debe quedar trabado en "emitiendo".
    const current = await db.query.movements.findFirst({ where: eq(schema.movements.id, m.id) });
    if (current?.status === "emitiendo") await fail((e as Error).message);
    throw e;
  }
}
