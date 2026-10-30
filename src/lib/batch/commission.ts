import { round2 } from "../format";
import { normalizeNit, parseDate, parseNumber, type RawRow, type RowError } from "./build";

/** Configuración del modelo "Pagos a terceros + comisión" (dispersión de pagos). */
export type CommissionModelConfig = {
  /** Código en Siigo del producto "Ingresos de Terceros" (sin impuestos). */
  thirdPartyCode: string;
  thirdPartyDescription: string;
  /** Código en Siigo del servicio "Comisión por Operaciones". */
  commissionCode: string;
  commissionDescription: string;
  /** ID del IVA (19%) en Siigo para la comisión. */
  ivaTaxId: number;
  /** false = el IVA va aparte (comisión = base); true = la comisión ya incluye el IVA. */
  ivaIncluded: boolean;
  /** ID de "Retefuente comisiones 11%": solo para persona jurídica colombiana (Company + NIT). null = no aplicar. */
  retentionTaxId: number | null;
  /** % de comisión sugerido al emitir (ej. 0.35). */
  defaultPct: number;
  /** Forma de pago para estas facturas (ej. Transferencia débito). null = la predeterminada. */
  paymentId: number | null;
  /** Redondear la comisión a pesos enteros. */
  roundToPeso: boolean;
};

export const DEFAULT_COMMISSION_CONFIG: CommissionModelConfig = {
  thirdPartyCode: "02",
  thirdPartyDescription: "Operación recibida para terceros",
  commissionCode: "01",
  commissionDescription: "Comisión por Operaciones",
  ivaTaxId: 0,
  ivaIncluded: false,
  retentionTaxId: null,
  defaultPct: 0.35,
  paymentId: null,
  roundToPeso: true,
};

export const COMMISSION_COLUMNS = [
  { key: "cliente_nit", required: true, help: "Cédula o NIT completo del mandante (cliente)" },
  { key: "valor_dispersado", required: true, help: "Valor dispersado al beneficiario (también se acepta valor_pago)" },
  { key: "fecha", required: true, help: "Fecha de la dispersión (la factura sale ese día). AAAA-MM-DD o DD/MM/AAAA" },
  { key: "id_operacion", required: true, help: "ID de la operación: va en observaciones y evita facturar dos veces" },
  { key: "descripcion", required: false, help: "Detalle del pago al tercero (vacío = Ingresos de Terceros)" },
  { key: "comision_pct", required: false, help: "% de comisión solo para esta fila (vacío = el del lote)" },
  { key: "referencia", required: false, help: "Para agrupar varias operaciones en una factura (vacío = una por operación)" },
  { key: "sucursal", required: false, help: "Sucursal del cliente en Siigo (por defecto 0)" },
] as const;

/**
 * Separa un valor con IVA incluido en base + IVA, de forma que base + round2(base × iva%) sea exactamente el total
 * (así, cuando Siigo sume el IVA a la base, el ítem vuelve a dar el valor original).
 */
export function splitIvaIncluded(total: number, ivaPct: number) {
  const rate = ivaPct / 100;
  const ideal = round2(total / (1 + rate));
  for (const delta of [0, -0.01, 0.01, -0.02, 0.02]) {
    const base = round2(ideal + delta);
    const iva = round2(base * rate);
    if (round2(base + iva) === round2(total)) return { base, iva };
  }
  const iva = round2(ideal * rate);
  return { base: ideal, iva };
}

/** Comisión (IVA incluido) de un pago: valor × % / 100, redondeada a pesos o centavos. */
export function commissionFor(payment: number, pct: number, roundToPeso: boolean) {
  const raw = (payment * pct) / 100;
  return roundToPeso ? Math.round(raw) : round2(raw);
}

/**
 * Convierte el archivo de dispersiones en filas del formato estándar. Por cada operación:
 * - ítem de terceros (código 02) por el valor dispersado, sin impuestos;
 * - ítem de comisión (código 01) por el % del valor dispersado, con IVA (aparte o incluido según configuración)
 *   y Retefuente solo si el cliente es persona jurídica colombiana.
 */
export function expandCommissionRows(
  rows: RawRow[],
  cfg: CommissionModelConfig,
  opts: { pct: number; ivaPct: number; today: string; isColombianCompany: (nit: string) => boolean },
): { rows: RawRow[]; errors: RowError[] } {
  const out: RawRow[] = [];
  const errors: RowError[] = [];
  const usedRefs = new Map<string, number>();
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

  rows.forEach((r, i) => {
    const fila = typeof r.__fila === "number" ? r.__fila : i + 2;
    if (Object.entries(r).every(([k, v]) => k === "__fila" || s(v) === "")) return;
    const nit = normalizeNit(r.cliente_nit);
    const payment = parseNumber(s(r.valor_dispersado) ? r.valor_dispersado : r.valor_pago);
    const pctRow = s(r.comision_pct) ? parseNumber(String(r.comision_pct).replace("%", "")) : opts.pct;
    const fecha = s(r.fecha) ? parseDate(r.fecha) : null;
    const operation = s(r.id_operacion);
    const fail = (message: string) => errors.push({ row: fila, message });
    if (!nit) return fail("Falta cliente_nit");
    if (payment === null || payment <= 0) return fail("valor_dispersado inválido");
    if (pctRow === null || pctRow < 0 || pctRow > 100) return fail("comision_pct inválido");
    if (!fecha) return fail(s(r.fecha) ? "Fecha inválida" : "Falta la fecha de la dispersión");
    if (!operation) return fail("Falta id_operacion");

    // Referencia estable: la operación. Si se vuelve a subir el archivo, se detecta como duplicado.
    let ref = s(r.referencia);
    if (!ref) {
      const baseRef = operation;
      const n = (usedRefs.get(baseRef) ?? 0) + 1;
      usedRefs.set(baseRef, n);
      if (n > 1) return fail(`id_operacion ${operation} repetido en el archivo`);
      ref = baseRef;
    }

    const commission = commissionFor(payment, pctRow, cfg.roundToPeso);
    const base = cfg.ivaIncluded ? splitIvaIncluded(commission, opts.ivaPct).base : commission;
    const withRetention = cfg.retentionTaxId && opts.isColombianCompany(nit);
    const header = {
      __fila: fila,
      referencia: ref,
      fecha,
      cliente_nit: nit,
      sucursal: r.sucursal,
      forma_pago: cfg.paymentId ?? undefined,
      observaciones: `ID operación: ${operation}`,
    };
    out.push({
      ...header,
      producto_codigo: cfg.thirdPartyCode,
      descripcion: s(r.descripcion) || cfg.thirdPartyDescription,
      cantidad: 1,
      precio: payment,
      impuestos: "ninguno",
    });
    if (commission > 0) {
      out.push({
        ...header,
        producto_codigo: cfg.commissionCode,
        descripcion: `${cfg.commissionDescription} ${pctRow}%`,
        cantidad: 1,
        precio: base,
        impuestos: [cfg.ivaTaxId, withRetention ? cfg.retentionTaxId : null].filter(Boolean).join("|"),
      });
    }
  });
  return { rows: out, errors };
}

/**
 * Vista previa de la factura de una operación con el modelo: la retención se calcula sobre la base de la
 * comisión SIN IVA (nunca sobre el IVA ni sobre el valor de terceros).
 */
export function previewCommissionInvoice(
  payment: number,
  cfg: Pick<CommissionModelConfig, "defaultPct" | "roundToPeso" | "ivaIncluded">,
  ivaPct: number,
  retentionPct: number | null,
) {
  const commission = commissionFor(payment, cfg.defaultPct, cfg.roundToPeso);
  const { base, iva } = cfg.ivaIncluded
    ? splitIvaIncluded(commission, ivaPct)
    : { base: commission, iva: round2((commission * ivaPct) / 100) };
  const retention = retentionPct ? round2((base * retentionPct) / 100) : 0;
  return { commission, base, iva, retention, total: round2(payment + base + iva - retention) };
}
