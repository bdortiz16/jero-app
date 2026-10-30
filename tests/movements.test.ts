import { describe, expect, it } from "vitest";
import { nitCheckDigit, parseIdentification, parseMovementRows, siigoName } from "@/lib/movements";
import { parseFile } from "@/lib/batch/parse";

describe("movimientos", () => {
  it("separa NIT y DV pegados, deja cédulas igual", () => {
    expect(nitCheckDigit("901970361")).toBe(3);
    expect(parseIdentification("9019703613", "KAUPALOKY S.A.S.")).toEqual({ identification: "901970361", checkDigit: "3", personType: "Company", idType: "31" });
    expect(parseIdentification("1060270234", "BRAYAN QUINTERO")).toMatchObject({ identification: "1060270234", personType: "Person", idType: "13" });
    expect(parseIdentification("10137700")).toMatchObject({ identification: "10137700", personType: "Person" });
    expect(parseIdentification("900.123.456-7")).toMatchObject({ identification: "900123456", checkDigit: "8", personType: "Company" });
    expect(parseIdentification("900123456-8")).toMatchObject({ identification: "900123456", checkDigit: "8", personType: "Company" });
  });

  it("arma el nombre para Siigo", () => {
    expect(siigoName("LUIS ALBERTO GONZALEZ SANTAMARIA", "Person")).toEqual(["LUIS ALBERTO", "GONZALEZ SANTAMARIA"]);
    expect(siigoName("Dora Patricia Marin Garcia", "Person")).toEqual(["Dora Patricia", "Marin Garcia"]);
    expect(siigoName("Juan Pérez", "Person")).toEqual(["Juan", "Pérez"]);
    expect(siigoName("KAUPALOKY S.A.S.", "Company")).toEqual(["KAUPALOKY S.A.S."]);
  });

  it("lee el formato 'Facturas por emitir' con títulos arriba", async () => {
    const csv = [
      "FACTURAS POR EMITIR;;;;;;;",
      "Una factura por beneficiario;;;;;;;",
      ";;;TOTAL:;5196;;;67372985665.27",
      "#;Empresa que factura;Cliente (beneficiario);Identificación;# retiros;Desde;Hasta;Valor a facturar",
      "1;JERO;KAUPALOKY S.A.S.;9019703613;68;2026-04-10;2026-09-09;3975272051.42",
      "2;KAUPALOKI;Jorge William Rengifo Ospina;16934739;1;16/10/2026;16/10/2026;80000",
    ].join("\n");
    const rows = await parseFile("x.csv", new TextEncoder().encode(csv).buffer as ArrayBuffer, { headerKey: "identificacion" });
    const { movements, errors } = parseMovementRows(rows);
    expect(errors).toEqual([]);
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({ rowNumber: 1, company: "JERO", identification: "901970361", checkDigit: "3", personType: "Company", withdrawals: 68, amount: 3975272051.42 });
    expect(movements[1]).toMatchObject({ company: "KAUPALOKI", identification: "16934739", personType: "Person", amount: 80000 });
    expect(movements[1].dateFrom?.toISOString().slice(0, 10)).toBe("2026-10-16");
  });
});
