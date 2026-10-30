import { describe, expect, it } from "vitest";
import { SiigoClient, siigoIdempotencyKey } from "@/lib/siigo/client";

describe("Idempotency-Key de Siigo", () => {
  it("es alfanumérica, de 32 caracteres y estable", () => {
    const k = siigoIdempotencyKey("jero-invoice-123");
    expect(k).toMatch(/^[a-f0-9]{32}$/);
    expect(siigoIdempotencyKey("jero-invoice-123")).toBe(k);
    expect(siigoIdempotencyKey("jero-invoice-124")).not.toBe(k);
  });

  it("si Siigo rechaza la llave, reintenta sin ella", async () => {
    const calls: Record<string, string>[] = [];
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    const responses = [
      () => json({ access_token: "t", expires_in: 86400 }),
      () => json({ Errors: [{ Code: "invalid_idempotency_key", Message: "The header Idempotency-Key has an invalid value", Params: ["Idempotency-Key"] }] }, 400),
      () => json({ id: "abc", name: "FV-1-9", number: 9, document: { id: 1 }, date: "2026-10-30", total: 1 }),
    ];
    let stored: { token: string; expiresAt: number } | null = null;
    const client = new SiigoClient({
      baseUrl: "https://x", username: "u", accessKey: "k", partnerId: "jero",
      tokenStore: { get: async () => stored, set: async (v) => void (stored = v) },
      fetch: (async (_url: string, init: RequestInit) => {
        calls.push((init.headers ?? {}) as Record<string, string>);
        return responses.shift()!();
      }) as typeof fetch,
    });
    const res = await client.createInvoice({} as never, "jero-invoice-1");
    expect(res.name).toBe("FV-1-9");
    expect(calls[1]["Idempotency-Key"]).toMatch(/^[a-f0-9]{32}$/);
    expect(calls[2]["Idempotency-Key"]).toBeUndefined();
  });
});
