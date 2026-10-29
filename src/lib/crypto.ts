import "server-only";

// AES-256-GCM con WebCrypto (funciona igual en Node y en Cloudflare Workers).
// Formato: iv.ciphertext+tag (base64).

const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64");
const unb64 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(s, "base64"));

let cached: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
  return (cached ??= (async () => {
    let raw: Uint8Array<ArrayBuffer> | null = null;
    if (process.env.ENCRYPTION_KEY) {
      const buf = unb64(process.env.ENCRYPTION_KEY);
      if (buf.length === 32) raw = buf;
    }
    if (!raw) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)");
      }
      // En desarrollo derivamos una llave de AUTH_SECRET para no bloquear el arranque.
      const seed = new TextEncoder().encode(process.env.AUTH_SECRET ?? "jero-dev");
      raw = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
    }
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  })());
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(enc)}`;
}

export async function decrypt(payload: string): Promise<string> {
  const [iv, enc] = payload.split(".").map(unb64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), enc);
  return new TextDecoder().decode(plain);
}
