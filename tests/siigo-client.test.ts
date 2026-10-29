import { describe, expect, it } from "vitest";
import { SiigoClient } from "@/lib/siigo/client";
import { SiigoError } from "@/lib/siigo/types";

function setup(responses: ((url: string, init: RequestInit) => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let stored: { token: string; expiresAt: number } | null = null;
  const client = new SiigoClient({
    baseUrl: "https://api.siigo.test",
    username: "api@empresa.co",
    accessKey: "secret",
    partnerId: "jero",
    tokenStore: { get: async () => stored, set: async (v) => void (stored = v) },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected call " + url);
      return next(url, init);
    }) as typeof fetch,
  });
  return { client, calls };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("SiigoClient", () => {
  it("authenticates with Partner-Id, caches token and sends Bearer", async () => {
    const { client, calls } = setup([
      json({ access_token: "tok", expires_in: 86400, token_type: "Bearer" }),
      json([{ id: 1, name: "IVA", type: "IVA", percentage: 19, active: true }]),
      json([]),
    ]);
    await client.taxes();
    await client.paymentTypes();
    expect(calls[0].url).toBe("https://api.siigo.test/auth");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: "api@empresa.co", access_key: "secret" });
    expect((calls[0].init.headers as Record<string, string>)["Partner-Id"]).toBe("jero");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(calls[2].url).toContain("/v1/payment-types?document_type=FV");
    expect(calls).toHaveLength(3); // token reutilizado
  });

  it("re-authenticates once on 401", async () => {
    const { client, calls } = setup([
      json({ access_token: "old", expires_in: 86400 }),
      json({}, 401),
      json({ access_token: "new", expires_in: 86400 }),
      json([]),
    ]);
    await client.taxes();
    expect((calls[3].init.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("maps Siigo error bodies", async () => {
    const { client } = setup([
      json({ access_token: "tok", expires_in: 86400 }),
      json({ Errors: [{ Code: "invalid_reference", Message: "The customer doesn't exist", Params: ["customer.identification"] }] }, 400),
    ]);
    const err = await client.getInvoice("x").catch((e) => e);
    expect(err).toBeInstanceOf(SiigoError);
    expect(err.message).toBe("invalid_reference: The customer doesn't exist (customer.identification)");
    expect(err.retryable).toBe(false);
  });
});
