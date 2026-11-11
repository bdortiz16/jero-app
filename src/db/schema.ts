import {
  customType,
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  // ADMIN | CONTADOR | USUARIO
  role: text("role").notNull().default("USUARIO"),
  // pending | active | disabled
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** Configuración clave/valor (credenciales Siigo cifradas, defaults, caché de catálogos, token). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    siigoId: text("siigo_id").unique(),
    identification: text("identification").notNull(),
    branchOffice: integer("branch_office").notNull().default(0),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    // Person | Company y código de tipo de documento de Siigo (31 = NIT): definen si aplica retención
    personType: text("person_type"),
    idType: text("id_type"),
    active: boolean("active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("customers_ident_branch").on(t.identification, t.branchOffice)],
);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  siigoId: text("siigo_id").unique(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 18, scale: 2 }),
  taxIds: jsonb("tax_ids").$type<number[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

/** Modelos de negocio: plantillas que convierten un archivo propio en facturas (ej. pagos a terceros + comisión). */
export const businessModels = pgTable("business_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // commission = pagos a terceros + comisión
  type: text("type").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceBatches = pgTable("invoice_batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name"),
  // draft (validado, sin enviar) | processing | done | cancelled
  status: text("status").notNull().default("draft"),
  totalCount: integer("total_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  // Filas rechazadas en la validación del archivo
  rowErrors: jsonb("row_errors").$type<{ row: number; reference?: string; message: string }[]>().notNull().default([]),
  // Modelo de negocio usado (null = archivo estándar por ítems) y parámetros del lote (ej. % de comisión)
  modelId: integer("model_id").references(() => businessModels.id),
  params: jsonb("params").$type<Record<string, unknown>>(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type InvoiceItem = {
  code: string;
  description?: string;
  quantity: number;
  price: number;
  discount: number;
  taxIds: number[];
};

export type InvoicePayload = {
  documentId: number;
  date: string;
  customer: { identification: string; branchOffice: number };
  sellerId: number;
  costCenterId?: number | null;
  observations?: string;
  items: InvoiceItem[];
  payments: { id: number; value: number; dueDate?: string }[];
  sendStamp: boolean;
  sendMail: boolean;
};

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").references(() => invoiceBatches.id, { onDelete: "cascade" }),
    // Referencia del archivo para agrupar filas en una factura
    reference: text("reference").notNull(),
    date: text("date").notNull(),
    customerIdentification: text("customer_identification").notNull(),
    customerName: text("customer_name"),
    payload: jsonb("payload").$type<InvoicePayload>().notNull(),
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 18, scale: 2 }).notNull().default("0"),
    retentionTotal: numeric("retention_total", { precision: 18, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 18, scale: 2 }).notNull().default("0"),
    // pending | processing | sent | error
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    siigoId: text("siigo_id"),
    siigoNumber: text("siigo_number"),
    stampStatus: text("stamp_status"),
    cufe: text("cufe"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("invoices_batch").on(t.batchId),
    index("invoices_status").on(t.status),
    index("invoices_date").on(t.date),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Archivos de movimientos cargados (ej. "Facturas por emitir"). */
export const movementImports = pgTable("movement_imports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Movimientos por facturar: una fila por beneficiario, tal como viene en el archivo. */
export const movements = pgTable(
  "movements",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id").references(() => movementImports.id),
    rowNumber: integer("row_number"),
    company: text("company").notNull(),
    customerName: text("customer_name").notNull(),
    // Identificación tal cual viene en el archivo, y la normalizada para Siigo (sin DV)
    identificationRaw: text("identification_raw").notNull(),
    identification: text("identification").notNull(),
    checkDigit: text("check_digit"),
    personType: text("person_type").notNull(),
    withdrawals: integer("withdrawals"),
    dateFrom: timestamp("date_from", { withTimezone: true }),
    dateTo: timestamp("date_to", { withTimezone: true }),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    // pendiente | emitiendo | facturado | error
    status: text("status").notNull().default("pendiente"),
    error: text("error"),
    invoiceId: integer("invoice_id").references(() => invoices.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("movements_unique").on(t.company, t.identificationRaw, t.dateFrom, t.dateTo, t.amount),
    index("movements_status").on(t.status),
  ],
);

/** Emisión masiva que corre en el servidor (en segundo plano), por tandas. */
export const emissionJobs = pgTable("emission_jobs", {
  id: serial("id").primaryKey(),
  // running | done | cancelled | failed
  status: text("status").notNull().default("running"),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  // IDs de movimientos a emitir, en orden; cursor = siguiente posición
  itemIds: jsonb("item_ids").$type<number[]>().notNull().default([]),
  cursor: integer("cursor").notNull().default(0),
  total: integer("total").notNull().default(0),
  ok: integer("ok").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  // Últimos resultados (para mostrar en pantalla) y los que se están emitiendo ahora
  log: jsonb("log").$type<{ id: number; name: string; status: "ok" | "error"; text: string; at: string }[]>().notNull().default([]),
  current: jsonb("current").$type<{ id: number; name: string; text: string }[]>().notNull().default([]),
  // Segundos de trabajo efectivo (para calcular el ritmo y el tiempo estimado)
  workSeconds: integer("work_seconds").notNull().default(0),
  origin: text("origin"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  error: text("error"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/**
 * Retiros (pagos) hechos a cada beneficiario, uno por uno, del archivo de cruce de retiros.
 * Sirven para que el cliente consulte en la página pública qué pagos recibió. De la cuenta
 * destino solo se guardan los últimos 4 dígitos: es el dato con que el cliente se verifica.
 */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: serial("id").primaryKey(),
    company: text("company").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    beneficiary: text("beneficiary").notNull(),
    idType: text("id_type"),
    identificationRaw: text("identification_raw").notNull(),
    // Identificación sin DV (la "clave del tercero"), para buscar
    idKey: text("id_key").notNull(),
    bank: text("bank"),
    accountLast4: text("account_last4"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    netAmount: numeric("net_amount", { precision: 18, scale: 2 }).notNull(),
    status: text("status"),
    invoiceRef: text("invoice_ref"),
    // Del pago: cuánto ya quedó en facturas anteriores (invoiceRef) y cuánto faltaba por facturar
    invoicedAmount: numeric("invoiced_amount", { precision: 18, scale: 2 }),
    pendingAmount: numeric("pending_amount", { precision: 18, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("withdrawals_unique").on(t.company, t.paidAt, t.idKey, t.netAmount),
    index("withdrawals_id_key").on(t.idKey),
  ],
);

/** Intentos de la consulta pública de pagos (para frenar a quien prueba documentos al azar). */
export const paymentLookups = pgTable(
  "payment_lookups",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    idKey: text("id_key").notNull(),
    ok: boolean("ok").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_lookups_ip").on(t.ip, t.createdAt), index("payment_lookups_key").on(t.idKey, t.createdAt)],
);

/**
 * Solicitudes de nota crédito que hacen los clientes desde la consulta pública de pagos cuando no
 * están de acuerdo con una factura. El equipo las revisa en la app (Notas crédito).
 */
/** Archivo binario (PDF de la nota crédito) guardado en la base. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const creditNoteRequests = pgTable(
  "credit_note_requests",
  {
    id: serial("id").primaryKey(),
    // Factura emitida desde Jero (si la hay) y su número, o el número de una factura anterior
    invoiceId: integer("invoice_id").references(() => invoices.id),
    invoiceNumber: text("invoice_number").notNull(),
    idKey: text("id_key").notNull(),
    identification: text("identification").notNull(),
    beneficiary: text("beneficiary"),
    contactName: text("contact_name").notNull(),
    // Correo o celular: al menos uno
    email: text("email"),
    phone: text("phone"),
    reason: text("reason").notNull(),
    detail: text("detail").notNull(),
    // pendiente | en_revision | aprobada | rechazada
    status: text("status").notNull().default("pendiente"),
    adminNote: text("admin_note"),
    // Lo que ve el cliente al volver a consultar: respuesta, y la nota crédito emitida (número y PDF)
    clientMessage: text("client_message"),
    creditNoteNumber: text("credit_note_number"),
    creditNoteFile: bytea("credit_note_file"),
    creditNoteFileName: text("credit_note_file_name"),
    creditNoteAt: timestamp("credit_note_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id),
  },
  (t) => [index("credit_note_requests_status").on(t.status, t.createdAt), index("credit_note_requests_key").on(t.idKey)],
);

export type CreditNoteRequest = typeof creditNoteRequests.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type User = typeof users.$inferSelect;
export type EmissionJob = typeof emissionJobs.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceBatch = typeof invoiceBatches.$inferSelect;
export type BusinessModel = typeof businessModels.$inferSelect;
