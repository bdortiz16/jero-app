import "server-only";

// AES-256-GCM con WebCrypto (funciona igual en Node y en Cloudflare Workers).
// Formato: iv.ciphertext+tag (base64).

const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64");
const unb64 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(s, "base64"));

let cached: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> {
  return (cached ??= (async () => {
    let raw: Uint8Array<ArrayBuffer> | null = null;
    const secret = process.env.ENCRYPTION_KEY?.trim();
    if (secret) {
      const buf = unb64(secret);
      // 32 bytes en base64 se usan tal cual; cualquier otra clave larga se deriva con SHA-256.
      if (buf.length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(secret)) raw = buf;
      else if (secret.length >= 16) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
    }
    if (!raw) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Falta ENCRYPTION_KEY (mínimo 16 caracteres) para guardar las credenciales de Siigo.");
      }
      // En desarrollo usamos una llave fija para no bloquear el arranque.
      const seed = new TextEncoder().encode("jero-dev-only-key");
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
