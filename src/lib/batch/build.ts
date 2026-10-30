import type { InvoiceItem, InvoicePayload } from "@/db/schema";
import { round2 } from "../format";

/** Columnas aceptadas en el archivo de facturación masiva (una fila = un ítem). */
export const COLUMNS = [
  { key: "referencia", required: true, help: "Agrupa las filas de una misma factura (ej. F-001)" },
  { key: "fecha", required: false, help: "AAAA-MM-DD o DD/MM/AAAA. Vacío = hoy" },
  { key: "cliente_nit", required: true, help: "Identificación del cliente (sin dígito de verificación)" },
  { key: "sucursal", required: false, help: "Sucursal del cliente en Siigo (por defecto 0)" },
  { key: "producto_codigo", required: true, help: "Código del producto/servicio en Siigo" },
  { key: "descripcion", required: false, help: "Descripción del ítem (opcional)" },
  { key: "cantidad", required: true, help: "Cantidad" },
  { key: "precio", required: true, help: "Precio unitario antes de impuestos" },
  { key: "descuento", required: false, help: "Descuento en valor para el ítem (por defecto 0)" },
  { key: "impuestos", required: false, help: "IDs de impuestos de Siigo separados por | (vacío = los del producto)" },
  { key: "forma_pago", required: false, help: "ID de forma de pago en Siigo (vacío = la predeterminada)" },
  { key: "vencimiento", required: false, help: "Fecha de vencimiento si es a crédito" },
  { key: "vendedor", required: false, help: "ID del vendedor en Siigo (vacío = predeterminado)" },
  { key: "centro_costo", required: false, help: "ID del centro de costo (opcional)" },
  { key: "observaciones", required: false, help: "Observaciones de la factura" },
] as const;

export type RawRow = Record<string, unknown>;

export type TaxInfo = { id: number; type: string; percentage: number; name?: string };
export type PaymentInfo = { id: number; due_date?: boolean };

export type BuildContext = {
  defaults: {
    documentId: number | null;
    sellerId: number | null;
    paymentId: number | null;
    costCenterId: number | null;
    dueDays: number;
    sendStamp: boolean;
    sendMail: boolean;
  };
  taxes: TaxInfo[];
  paymentTypes: PaymentInfo[];
  /** Impuestos por código de producto (de los productos sincronizados). */
  productTaxes: Map<string, number[]>;
  /** Clientes conocidos (identificación → nombre). Si está vacío no se valida. */
  customers: Map<string, string>;
  today: string;
};

export type BuiltInvoice = {
  reference: string;
  rows: number[];
  customerName: string | null;
  payload: InvoicePayload;
  subtotal: number;
  taxTotal: number;
  retentionTotal: number;
  total: number;
};

export type RowError = { row: number; reference?: string; message: string };

const RETENTION_TYPES = ["retefuente", "reteica", "reteiva", "retención", "retencion"];

export function isRetention(t: TaxInfo) {
  const k = t.type.toLowerCase();
  return RETENTION_TYPES.some((r) => k.includes(r));
}

/** Normaliza un encabezado: minúsculas, sin tildes, espacios → _. */
export function normalizeHeader(h: string) {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const str = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** Acepta 1.234,56 / 850.000 / 1,234.56 / 1234.56 / números. Una sola coma es decimal (1,5). */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = str(v).replace(/[$\s]/g, "");
  if (!s) return null;
  // "850.000" o "1.234.567" sin coma: en Colombia el punto es separador de miles.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Serial de Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Quita puntos, espacios y dígito de verificación: "900.123.456-7" → "900123456". */
export function normalizeNit(v: unknown) {
  return str(v).replace(/[.\s]/g, "").replace(/-\d$/, "");
}

function parseIds(v: unknown): number[] | null {
  const s = str(v);
  if (!s || /^(ninguno|sin|0)$/i.test(s)) return [];
  const ids = s.split(/[|;,\s]+/).filter(Boolean).map(Number);
  return ids.every((n) => Number.isInteger(n) && n > 0) ? ids : null;
}

/** Calcula subtotal, impuestos, retenciones y total a pagar de una lista de ítems. */
export function computeTotals(items: InvoiceItem[], taxes: TaxInfo[]) {
  const byId = new Map(taxes.map((t) => [t.id, t]));
  let subtotal = 0;
  let taxTotal = 0;
  let retentionTotal = 0;
  for (const it of items) {
    const base = round2(it.quantity * it.price - it.discount);
    subtotal += base;
    const itemTaxes = it.taxIds.map((id) => byId.get(id)).filter(Boolean) as TaxInfo[];
    const iva = itemTaxes
      .filter((t) => !isRetention(t))
      .reduce((s, t) => s + round2((base * t.percentage) / 100), 0);
    taxTotal += iva;
    for (const t of itemTaxes.filter(isRetention)) {
      // ReteIVA se calcula sobre el IVA; las demás retenciones sobre la base.
      const over = t.type.toLowerCase().includes("iva") ? iva : base;
      retentionTotal += round2((over * t.percentage) / 100);
    }
  }
  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);
  retentionTotal = round2(retentionTotal);
  return { subtotal, taxTotal, retentionTotal, total: round2(subtotal + taxTotal - retentionTotal) };
}

/**
 * Convierte las filas del archivo en facturas listas para enviar a Siigo.
 * Devuelve las facturas válidas y los errores por fila; una factura con cualquier fila inválida se descarta completa.
 */
export function buildInvoices(rows: RawRow[], ctx: BuildContext): { invoices: BuiltInvoice[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const taxIds = new Set(ctx.taxes.map((t) => t.id));
  const payments = new Map(ctx.paymentTypes.map((p) => [p.id, p]));

  if (!ctx.defaults.documentId) {
    return { invoices: [], errors: [{ row: 0, message: "Falta configurar el tipo de comprobante (Admin → Siigo)." }] };
  }

  type Group = { rows: number[]; first: RawRow; items: InvoiceItem[]; bad: boolean };
  const groups = new Map<string, Group>();

  rows.forEach((r, i) => {
    // +1 encabezado, +1 base 1; los modelos de negocio indican la fila original en __fila
    const rowNum = typeof r.__fila === "number" ? r.__fila : i + 2;
    const ref = str(r.referencia);
    const fail = (message: string) => {
      errors.push({ row: rowNum, reference: ref || undefined, message });
      if (ref && groups.has(ref)) groups.get(ref)!.bad = true;
    };
    if (Object.entries(r).every(([k, v]) => k === "__fila" || str(v) === "")) return; // fila vacía
    if (!ref) return fail("Falta la referencia");

    let g = groups.get(ref);
    if (!g) groups.set(ref, (g = { rows: [], first: r, items: [], bad: false }));
    g.rows.push(rowNum);

    // Campos de cabecera deben coincidir entre filas de la misma factura
    const norm = (k: string, v: unknown) => (k === "cliente_nit" ? normalizeNit(v) : str(v));
    for (const k of ["cliente_nit", "fecha", "forma_pago"]) {
      if (g.first !== r && str(r[k]) && norm(k, r[k]) !== norm(k, g.first[k])) {
        return fail(`"${k}" distinto a la primera fila de la factura ${ref}`);
      }
    }

    const code = str(r.producto_codigo);
    const quantity = parseNumber(r.cantidad);
    const price = parseNumber(r.precio);
    const discount = parseNumber(r.descuento) ?? 0;
    let taxes = parseIds(r.impuestos);
    if (!code) return fail("Falta producto_codigo");
    if (quantity === null || quantity <= 0) return fail("Cantidad inválida");
    if (price === null || price < 0) return fail("Precio inválido");
    if (discount < 0 || discount > quantity * price) return fail("Descuento inválido");
    if (taxes === null) return fail("Impuestos inválidos (use IDs numéricos separados por |)");
    // "ninguno" = sin impuestos explícitamente (no se toman los del producto)
    if (taxes.length === 0 && !/^(ninguno|sin|0)$/i.test(str(r.impuestos))) taxes = ctx.productTaxes.get(code) ?? [];
    const unknownTax = taxes.find((t) => taxIds.size && !taxIds.has(t));
    if (unknownTax) return fail(`El impuesto ${unknownTax} no existe en Siigo (actualice catálogos)`);

    g.items.push({ code, description: str(r.descripcion) || undefined, quantity, price, discount, taxIds: taxes });
  });

  const invoices: BuiltInvoice[] = [];
  for (const [reference, g] of groups) {
    if (g.bad || g.items.length === 0) continue;
    const r = g.first;
    const row = g.rows[0];
    const fail = (message: string) => errors.push({ row, reference, message });

    const identification = normalizeNit(r.cliente_nit);
    if (!identification) {
      fail("Falta cliente_nit");
      continue;
    }
    const customerName = ctx.customers.get(identification) ?? null;
    if (ctx.customers.size && !customerName) {
      fail(`El cliente ${identification} no está en los clientes sincronizados de Siigo`);
      continue;
    }
    const date = str(r.fecha) ? parseDate(r.fecha) : ctx.today;
    if (!date) {
      fail("Fecha inválida");
      continue;
    }
    const paymentId = str(r.forma_pago) ? parseNumber(r.forma_pago) : ctx.defaults.paymentId;
    if (!paymentId) {
      fail("Falta forma de pago (columna forma_pago o predeterminada en Admin → Siigo)");
      continue;
    }
    const payment = payments.get(paymentId);
    if (payments.size && !payment) {
      fail(`La forma de pago ${paymentId} no existe en Siigo`);
      continue;
    }
    const sellerId = str(r.vendedor) ? parseNumber(r.vendedor) : ctx.defaults.sellerId;
    if (!sellerId) {
      fail("Falta vendedor (columna vendedor o predeterminado en Admin → Siigo)");
      continue;
    }
    let dueDate: string | undefined;
    if (str(r.vencimiento)) {
      const d = parseDate(r.vencimiento);
      if (!d) {
        fail("Vencimiento inválido");
        continue;
      }
      dueDate = d;
    } else if (payment?.due_date) {
      dueDate = addDays(date, ctx.defaults.dueDays);
    }
    const costCenterId = str(r.centro_costo) ? parseNumber(r.centro_costo) : ctx.defaults.costCenterId;

    const totals = computeTotals(g.items, ctx.taxes);
    if (totals.total <= 0) {
      fail("El total de la factura debe ser mayor a 0");
      continue;
    }
    invoices.push({
      reference,
      rows: g.rows,
      customerName,
      ...totals,
      payload: {
        documentId: ctx.defaults.documentId,
        date,
        customer: { identification, branchOffice: parseNumber(r.sucursal) ?? 0 },
        sellerId,
        costCenterId: costCenterId ?? null,
        observations: str(r.observaciones) || undefined,
        items: g.items,
        payments: [{ id: paymentId, value: totals.total, dueDate }],
        sendStamp: ctx.defaults.sendStamp,
        sendMail: ctx.defaults.sendMail,
      },
    });
  }
  errors.sort((a, b) => a.row - b.row);
  return { invoices, errors };
}

/** Traduce el payload interno al cuerpo que espera POST /v1/invoices de Siigo. */
export function toSiigoRequest(p: InvoicePayload) {
  return {
    document: { id: p.documentId },
    date: p.date,
    customer: { identification: p.customer.identification, branch_office: p.customer.branchOffice },
    ...(p.costCenterId ? { cost_center: p.costCenterId } : {}),
    seller: p.sellerId,
    ...(p.observations ? { observations: p.observations } : {}),
    items: p.items.map((i) => ({
      code: i.code,
      ...(i.description ? { description: i.description } : {}),
      quantity: i.quantity,
      price: i.price,
      ...(i.discount ? { discount: i.discount } : {}),
      taxes: i.taxIds.map((id) => ({ id })),
    })),
    payments: p.payments.map((pm) => ({ id: pm.id, value: pm.value, ...(pm.dueDate ? { due_date: pm.dueDate } : {}) })),
    stamp: { send: p.sendStamp },
    mail: { send: p.sendMail },
  };
}
