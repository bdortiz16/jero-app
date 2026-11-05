import { describe, expect, it } from "vitest";
import { lookupKeys, parseDocInput, parseWithdrawalSheets } from "@/lib/withdrawals";

describe("retiros", () => {
  const header = ["Fecha retiro", "Mes", "Beneficiario", "Tipo ID", "Identificación", "Banco destino", "Cuenta destino", "Importe", "Importe neto", "Estado", "Factura(s) FV", "Valor facturado asignado", "Pendiente por facturar", "Cómo se cruzó", "Observación", "Clave tercero"];
  const fila = (fecha: Date, nombre: string, id: string, cuenta: string, neto: number, estado: string, fv: string | null, clave: string) =>
    [fecha, "2026-01", nombre, "nit", id, "bancolombia", cuenta, neto + 1000, neto, estado, fv, 0, 0, null, null, clave];
  const sheets = [
    { sheet: "JERO", data: [["título"], [], [], header,
      fila(new Date(Date.UTC(2026, 0, 2, 18, 27, 9, 999)), "Persona De Prueba", "12345678", "99900001234", 15750000, "FACTURADA", "FV-1-100", "12345678"),
      fila(new Date(Date.UTC(2026, 0, 2, 18, 42, 51)), "EMPRESA PROPIA SAS", "9000000001", "111122223333", 81112633, "TRASLADO PROPIO (no factura)", null, "900000000")] },
    { sheet: "JERO EMITIDAS", data: [header, fila(new Date(), "Repetida", "1", "1234", 1, "FACTURADA", null, "1")] },
  ];

  it("lee las hojas de retiros, guarda solo los 4 últimos dígitos de la cuenta y omite traslados propios", () => {
    const r = parseWithdrawalSheets(sheets);
    expect(r.sheets).toEqual(["JERO"]);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toMatchObject({ company: "JERO", idKey: "12345678", accountLast4: "1234", netAmount: 15750000, invoiceRef: "FV-1-100", invoicedAmount: 0, pendingAmount: 0 });
    // 18:27:09.999 "hora del Excel" = 18:27:10 en Bogotá = 23:27:10 UTC
    expect(r.rows[0].paidAt).toBe("2026-01-02T23:27:10.000Z");
  });

  it("acepta el NIT con o sin dígito de verificación", () => {
    expect(lookupKeys("900.123.456-1")).toEqual(["9001234561", "900123456"]);
    expect(lookupKeys("12345678")).toEqual(["12345678"]);
    expect(lookupKeys("12")).toEqual([]);
  });

  it("entiende el documento como lo escriba el cliente", () => {
    expect(parseDocInput("1.005.237.062")).toEqual({ full: "1005237062", base: null, explicitNit: false });
    expect(parseDocInput(" 10 052 370 62 ")).toEqual({ full: "1005237062", base: null, explicitNit: false });
    // NIT con DV pegado (válido) o separado por guion, con o sin puntos y texto
    expect(parseDocInput("9019703613")).toEqual({ full: "9019703613", base: "901970361", explicitNit: false });
    expect(parseDocInput("NIT 901.970.361-3")).toEqual({ full: "9019703613", base: "901970361", explicitNit: true });
    expect(parseDocInput("901970361 - 3")).toEqual({ full: "9019703613", base: "901970361", explicitNit: true });
    // Un DV equivocado con guion igual se busca por el NIT
    expect(parseDocInput("901970361-5")?.base).toBe("901970361");
    // 10 dígitos cuyo último no es un DV válido: no se recorta (podría ser una cédula)
    expect(parseDocInput("9019703619")?.base).toBeNull();
    expect(parseDocInput("abc")).toBeNull();
  });
});
