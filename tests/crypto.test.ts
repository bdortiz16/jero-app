import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

async function load(key: string) {
  vi.resetModules();
  process.env.ENCRYPTION_KEY = key;
  return import("@/lib/crypto");
}

describe("crypto", () => {
  it.each([
    ["base64 de 32 bytes", Buffer.alloc(32, 7).toString("base64")],
    ["hex de generate-secret", "9f86d081884c7d659a2feaa0c55ad015"],
    ["frase larga", "una clave cualquiera de jero 2026"],
  ])("cifra y descifra con %s", async (_, key) => {
    const { encrypt, decrypt } = await load(key);
    const enc = await encrypt("access-key-siigo");
    expect(enc).not.toContain("access-key-siigo");
    expect(await decrypt(enc)).toBe("access-key-siigo");
  });

  it("no descifra con otra clave", async () => {
    const enc = await (await load("clave-numero-uno-123")).encrypt("x");
    const other = await load("clave-numero-dos-456");
    await expect(other.decrypt(enc)).rejects.toThrow();
  });
});
