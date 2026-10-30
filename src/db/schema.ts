import {
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

export type User = typeof users.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceBatch = typeof invoiceBatches.$inferSelect;
export type BusinessModel = typeof businessModels.$inferSelect;
