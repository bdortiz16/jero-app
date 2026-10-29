import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)");
  }
  // En desarrollo derivamos una llave de AUTH_SECRET para no bloquear el arranque.
  return createHash("sha256").update(process.env.AUTH_SECRET ?? "jero-dev").digest();
}

/** AES-256-GCM. Formato: iv.tag.ciphertext (base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
