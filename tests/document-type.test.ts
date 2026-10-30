import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));
import { resolveDocumentId, type Catalogs } from "@/lib/siigo";

const cat = (docs: { id: number; name: string }[]) => ({ documentTypes: docs.map((d) => ({ ...d, code: "1" })) }) as unknown as Catalogs;

describe("resolveDocumentId", () => {
  it("usa el configurado", () => expect(resolveDocumentId({ documentId: 7 }, cat([{ id: 1, name: "x" }]))).toBe(7));
  it("elige el único de Siigo", () => expect(resolveDocumentId({ documentId: null }, cat([{ id: 24446, name: "Factura de venta" }]))).toBe(24446));
  it("prefiere la electrónica si hay varios", () =>
    expect(resolveDocumentId({ documentId: null }, cat([{ id: 1, name: "Factura POS" }, { id: 2, name: "Factura electrónica de venta" }]))).toBe(2));
  it("pide elegir si es ambiguo", () =>
    expect(resolveDocumentId({ documentId: null }, cat([{ id: 1, name: "Factura A" }, { id: 2, name: "Factura B" }]))).toBeNull());
});
