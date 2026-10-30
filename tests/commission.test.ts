import { describe, expect, it } from "vitest";
import { buildInvoices, toSiigoRequest, type BuildContext } from "@/lib/batch/build";
import { DEFAULT_COMMISSION_CONFIG, expandCommissionRows, splitIvaIncluded } from "@/lib/batch/commission";

const ctx: BuildContext = {
  defaults: { documentId: 100, sellerId: 211, paymentId: 1, costCenterId: null, dueDays: 30, sendStamp: true, sendMail: true },
  taxes: [
    { id: 19, type: "IVA", percentage: 19 },
    { id: 11, type: "Retefuente", percentage: 11, name: "Retefuente comisiones 11%" },
  ],
  paymentTypes: [{ id: 1 }, { id: 77 }],
  productTaxes: new Map([["02", [19]]]), // aunque el producto 02 tuviera IVA, no se debe enviar
  customers: new Map([["900123456", "Empresa SAS"], ["1020304050", "Persona Natural"]]),
  today: "2026-10-30",
};
const cfg = { ...DEFAULT_COMMISSION_CONFIG, ivaTaxId: 19, retentionTaxId: 11, paymentId: 77 };
const companies = new Set(["900123456"]);

function run(rows: Record<string, unknown>[]) {
  const exp = expandCommissionRows(rows, cfg, { pct: 0.35, ivaPct: 19, today: ctx.today, isColombianCompany: (n) => companies.has(n) });
  const built = buildInvoices(exp.rows, ctx);
  return { ...built, errors: [...exp.errors, ...built.errors] };
}

describe("modelo pagos a terceros + comisión", () => {
  it("ejemplo de JERO: 400.000.000 a persona jurídica", () => {
    const { invoices, errors } = run([
      { cliente_nit: "900.123.456-7", valor_dispersado: "400.000.000", fecha: "29/10/2026", id_operacion: "OP-778" },
    ]);
    expect(errors).toEqual([]);
    const inv = invoices[0];
    expect(inv.payload.date).toBe("2026-10-29");
    expect(inv.payload.observations).toBe("ID operación: OP-778");
    const [terceros, comision] = inv.payload.items;
    expect(terceros).toMatchObject({ code: "02", price: 400_000_000, taxIds: [] });
    expect(comision).toMatchObject({ code: "01", price: 1_400_000, taxIds: [19, 11] });
    expect(inv.subtotal).toBe(401_400_000);
    expect(inv.taxTotal).toBe(266_000);
    expect(inv.retentionTotal).toBe(154_000);
    expect(inv.payload.payments[0]).toMatchObject({ id: 77, value: 401_512_000 });
    const req = toSiigoRequest(inv.payload);
    expect(req.items[0].taxes).toEqual([]);
    expect(req.items[1].taxes).toEqual([{ id: 19 }, { id: 11 }]);
  });

  it("persona natural: sin retención", () => {
    const { invoices } = run([{ cliente_nit: "1020304050", valor_dispersado: 400_000_000, fecha: "2026-10-29", id_operacion: "A1" }]);
    expect(invoices[0].payload.items[1].taxIds).toEqual([19]);
    expect(invoices[0].retentionTotal).toBe(0);
    expect(invoices[0].total).toBe(401_666_000);
  });

  it("valida fecha, id de operación y duplicados en el archivo", () => {
    const { invoices, errors } = run([
      { cliente_nit: "1020304050", valor_dispersado: 1000, id_operacion: "X" },
      { cliente_nit: "1020304050", valor_dispersado: 1000, fecha: "2026-10-29" },
      { cliente_nit: "1020304050", valor_dispersado: 1000, fecha: "2026-10-29", id_operacion: "D" },
      { cliente_nit: "1020304050", valor_dispersado: 1000, fecha: "2026-10-29", id_operacion: "D" },
    ]);
    expect(invoices).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 5]);
  });

  it("IVA incluido: base + IVA = valor de la comisión", () => {
    for (const total of [20000, 1400000, 999.99, 12345.67]) {
      const { base, iva } = splitIvaIncluded(total, 19);
      expect(Math.round((base + iva) * 100) / 100).toBe(total);
    }
  });
});
