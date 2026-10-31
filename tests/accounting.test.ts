import { describe, expect, it } from "vitest";
import { bimester, journalEntry, profitEstimate, sumRows } from "@/lib/accounting";

describe("reportes contables", () => {
  // Factura de ejemplo: dispersión 10.000.000 + comisión 35.000 + IVA 6.650 − retención 3.850
  const t = sumRows([{ count: 1, thirdParty: 10_000_000, commission: 35_000, tax: 6_650, retention: 3_850, total: 10_037_800 }]);

  it("el asiento queda cuadrado", () => {
    const lines = journalEntry(t);
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBeCloseTo(credit, 2);
  });

  it("utilidad sobre la comisión, no sobre lo de terceros", () => {
    const p = profitEstimate(t);
    expect(p.income).toBe(35_000);
    expect(p.incomeTax).toBeCloseTo(12_250);
    expect(p.netProfit).toBeCloseTo(22_750);
    expect(p.incomeTaxAfterRetention).toBeCloseTo(8_400);
    expect(p.margin).toBeCloseTo(0.0035);
  });

  it("bimestres de IVA", () => {
    expect(bimester("2026-10").label).toBe("Sep–Oct 2026");
    expect(bimester("2026-11").label).toBe("Nov–Dic 2026");
    expect(bimester("2026-01").key).toBe("2026-01");
  });
});
