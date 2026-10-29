import { describe, expect, it } from "vitest";
import { buildInvoices, computeTotals, parseDate, parseNumber, toSiigoRequest, type BuildContext } from "@/lib/batch/build";

const ctx = (over: Partial<BuildContext> = {}): BuildContext => ({
  defaults: { documentId: 24446, sellerId: 629, paymentId: 5636, costCenterId: null, dueDays: 30, sendStamp: true, sendMail: false },
  taxes: [
    { id: 1, type: "IVA", percentage: 19 },
    { id: 2, type: "IVA", percentage: 5 },
    { id: 3, type: "Retefuente", percentage: 4 },
    { id: 5, type: "ReteIVA", percentage: 15 },
  ],
  paymentTypes: [{ id: 5636, due_date: true }, { id: 5637 }],
  productTaxes: new Map([["SERV-01", [1]]]),
  customers: new Map([["900123456", "Andina SAS"], ["1020304050", "Laura"]]),
  today: "2026-10-29",
  ...over,
});

describe("parsers", () => {
  it("parses Colombian and plain numbers", () => {
    expect(parseNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("$ 850000")).toBe(850000);
    expect(parseNumber(12)).toBe(12);
    expect(parseNumber("850.000")).toBe(850000);
    expect(parseNumber("1.234.567")).toBe(1234567);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("abc")).toBeNull();
  });
  it("parses dates", () => {
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate(46000)).toBe("2025-12-09");
  });
});

describe("computeTotals", () => {
  it("adds VAT and subtracts retentions (ReteIVA over VAT)", () => {
    const t = computeTotals(
      [{ code: "A", quantity: 2, price: 100000, discount: 0, taxIds: [1, 3, 5] }],
      ctx().taxes,
    );
    expect(t.subtotal).toBe(200000);
    expect(t.taxTotal).toBe(38000);
    // retefuente 4% de 200000 = 8000; reteIVA 15% de 38000 = 5700
    expect(t.retentionTotal).toBe(13700);
    expect(t.total).toBe(224300);
  });
});

describe("buildInvoices", () => {
  it("groups rows by reference and fills defaults", () => {
    const { invoices, errors } = buildInvoices(
      [
        { referencia: "F-1", cliente_nit: "900.123.456-7", producto_codigo: "SERV-01", cantidad: "1", precio: "850000" },
        { referencia: "F-1", cliente_nit: "900123456", producto_codigo: "PROD-01", cantidad: 2, precio: 35000, impuestos: "2" },
        { referencia: "F-2", fecha: "01/10/2026", cliente_nit: "1020304050", producto_codigo: "SERV-01", cantidad: 1, precio: 100, forma_pago: "5637" },
      ],
      ctx(),
    );
    expect(errors).toEqual([]);
    expect(invoices).toHaveLength(2);
    const [f1, f2] = invoices;
    expect(f1.payload.customer.identification).toBe("900123456");
    expect(f1.payload.items).toHaveLength(2);
    expect(f1.taxTotal).toBe(161500 + 3500);
    expect(f1.payload.payments[0]).toEqual({ id: 5636, value: f1.total, dueDate: "2026-11-28" });
    expect(f2.payload.date).toBe("2026-10-01");
    expect(f2.payload.payments[0].dueDate).toBeUndefined();

    const req = toSiigoRequest(f1.payload);
    expect(req.document).toEqual({ id: 24446 });
    expect(req.items[0].taxes).toEqual([{ id: 1 }]);
    expect(req.payments[0].due_date).toBe("2026-11-28");
    expect(req.mail).toEqual({ send: false });
  });

  it("rejects the whole invoice when one row is invalid", () => {
    const { invoices, errors } = buildInvoices(
      [
        { referencia: "F-1", cliente_nit: "900123456", producto_codigo: "SERV-01", cantidad: 1, precio: 10 },
        { referencia: "F-1", cliente_nit: "900123456", producto_codigo: "SERV-01", cantidad: 0, precio: 10 },
        { referencia: "F-2", cliente_nit: "999", producto_codigo: "SERV-01", cantidad: 1, precio: 10 },
        { referencia: "F-3", cliente_nit: "900123456", producto_codigo: "X", cantidad: 1, precio: 10, impuestos: "77" },
        { referencia: "", cliente_nit: "", producto_codigo: "", cantidad: "", precio: "" },
      ],
      ctx(),
    );
    expect(invoices).toHaveLength(0);
    expect(errors.map((e) => [e.row, e.reference])).toEqual([
      [3, "F-1"],
      [4, "F-2"],
      [5, "F-3"],
    ]);
  });

  it("requires a document type", () => {
    const r = buildInvoices([{ referencia: "x" }], ctx({ defaults: { ...ctx().defaults, documentId: null } }));
    expect(r.errors[0].message).toMatch(/tipo de comprobante/);
  });
});
