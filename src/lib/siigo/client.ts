import { createHash } from "node:crypto";
import {
  SiigoError,
  type SiigoCostCenter,
  type SiigoCustomerRequest,
  type SiigoCustomer,
  type SiigoDocumentType,
  type SiigoErrorBody,
  type SiigoInvoiceRequest,
  type SiigoInvoiceResponse,
  type SiigoPaged,
  type SiigoPaymentType,
  type SiigoProduct,
  type SiigoTax,
  type SiigoTokenResponse,
  type SiigoUser,
} from "./types";

export type TokenStore = {
  get(): Promise<{ token: string; expiresAt: number } | null>;
  set(v: { token: string; expiresAt: number } | null): Promise<void>;
};

export type SiigoConfig = {
  baseUrl: string;
  username: string;
  accessKey: string;
  partnerId: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
};

export interface SiigoApi {
  testConnection(): Promise<void>;
  documentTypes(type?: string): Promise<SiigoDocumentType[]>;
  taxes(): Promise<SiigoTax[]>;
  paymentTypes(documentType?: string): Promise<SiigoPaymentType[]>;
  users(): Promise<SiigoUser[]>;
  costCenters(): Promise<SiigoCostCenter[]>;
  customers(page: number, pageSize?: number): Promise<SiigoPaged<SiigoCustomer>>;
  products(page: number, pageSize?: number): Promise<SiigoPaged<SiigoProduct>>;
  findCustomer(identification: string): Promise<SiigoCustomer | null>;
  createCustomer(body: SiigoCustomerRequest): Promise<SiigoCustomer>;
  createInvoice(body: SiigoInvoiceRequest, idempotencyKey?: string): Promise<SiigoInvoiceResponse>;
  getInvoice(id: string): Promise<SiigoInvoiceResponse>;
  /** PDF de la factura generado por Siigo (null si Siigo no lo entrega). */
  invoicePdf(id: string): Promise<Uint8Array | null>;
}

export class SiigoClient implements SiigoApi {
  private fetchImpl: typeof fetch;

  constructor(private cfg: SiigoConfig) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }

  private async token(force = false): Promise<string> {
    if (!force) {
      const cached = await this.cfg.tokenStore.get();
      // Renovamos 5 minutos antes de vencer.
      if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.token;
    }
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/auth`, {
      signal: AbortSignal.timeout(30_000),
      method: "POST",
      headers: { "Content-Type": "application/json", "Partner-Id": this.cfg.partnerId },
      body: JSON.stringify({ username: this.cfg.username, access_key: this.cfg.accessKey }),
    });
    if (!res.ok) {
      const body = await safeJson(res);
      throw new SiigoError(`Autenticación con Siigo falló: ${describe(body) || res.statusText}`, res.status, body);
    }
    const data = (await res.json()) as SiigoTokenResponse;
    const value = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000 };
    await this.cfg.tokenStore.set(value);
    return value.token;
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    let retried401 = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.token(retried401);
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
          // Siigo a veces tarda: nunca esperar más de 30 s por una respuesta.
          signal: AbortSignal.timeout(30_000),
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Partner-Id": this.cfg.partnerId,
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        throw new SiigoError(`No se pudo conectar con Siigo: ${(e as Error).message}`, 0);
      }

      if (res.status === 401 && !retried401) {
        retried401 = true;
        continue;
      }
      // Límite de peticiones: esperamos y reintentamos unas pocas veces.
      if (res.status === 429 && attempt < 3) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 15_000)));
        continue;
      }
      if (!res.ok) {
        const errBody = await safeJson(res);
        const message = describe(errBody) || `Siigo respondió ${res.status} ${res.statusText}`;
        // Caída temporal de Siigo (ej. "The Documents service is currently unavailable"): la petición no se
        // procesó, así que se reintenta unas veces con espera antes de darla por fallida.
        if (isSiigoUnavailable(res.status, message)) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
            continue;
          }
          throw new SiigoError(`Siigo no está disponible en este momento (falla de Siigo, no de la factura). Reintenta en unos minutos. Detalle: ${message}`, res.status, errBody);
        }
        throw new SiigoError(message, res.status, errBody);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
  }

  async testConnection() {
    await this.token(true);
  }

  documentTypes(type = "FV") {
    return this.request<SiigoDocumentType[]>("GET", `/v1/document-types?type=${encodeURIComponent(type)}`);
  }
  taxes() {
    return this.request<SiigoTax[]>("GET", "/v1/taxes");
  }
  paymentTypes(documentType = "FV") {
    return this.request<SiigoPaymentType[]>("GET", `/v1/payment-types?document_type=${encodeURIComponent(documentType)}`);
  }
  users() {
    return this.request<SiigoPaged<SiigoUser> | SiigoUser[]>("GET", "/v1/users").then(unwrap);
  }
  costCenters() {
    return this.request<SiigoCostCenter[]>("GET", "/v1/cost-centers");
  }
  customers(page: number, pageSize = 100) {
    return this.request<SiigoPaged<SiigoCustomer>>("GET", `/v1/customers?page=${page}&page_size=${pageSize}`);
  }
  products(page: number, pageSize = 100) {
    return this.request<SiigoPaged<SiigoProduct>>("GET", `/v1/products?page=${page}&page_size=${pageSize}`);
  }
  async findCustomer(identification: string) {
    const r = await this.request<SiigoPaged<SiigoCustomer>>(
      "GET",
      `/v1/customers?identification=${encodeURIComponent(identification)}`,
    );
    return r.results[0] ?? null;
  }
  createCustomer(body: SiigoCustomerRequest) {
    return this.request<SiigoCustomer>("POST", "/v1/customers", body);
  }
  async createInvoice(body: SiigoInvoiceRequest, idempotencyKey?: string) {
    const key = idempotencyKey ? siigoIdempotencyKey(idempotencyKey) : undefined;
    try {
      return await this.request<SiigoInvoiceResponse>("POST", "/v1/invoices", body, key ? { "Idempotency-Key": key } : undefined);
    } catch (e) {
      // Si Siigo no acepta la llave, la factura no se creó: se reintenta una vez sin ella.
      if (key && e instanceof SiigoError && /idempotency/i.test(e.message)) {
        return this.request<SiigoInvoiceResponse>("POST", "/v1/invoices", body);
      }
      throw e;
    }
  }
  getInvoice(id: string) {
    return this.request<SiigoInvoiceResponse>("GET", `/v1/invoices/${encodeURIComponent(id)}`);
  }
  async invoicePdf(id: string) {
    // Siigo responde { id, base64 } con el PDF codificado.
    const r = await this.request<{ base64?: string }>("GET", `/v1/invoices/${encodeURIComponent(id)}/pdf`);
    return r?.base64 ? new Uint8Array(Buffer.from(r.base64, "base64")) : null;
  }
}

function unwrap<T>(r: SiigoPaged<T> | T[]): T[] {
  return Array.isArray(r) ? r : r.results;
}

async function safeJson(res: Response): Promise<SiigoErrorBody | undefined> {
  try {
    return (await res.json()) as SiigoErrorBody;
  } catch {
    return undefined;
  }
}

/** Convierte el cuerpo de error de Siigo en un mensaje legible. */
export function describe(body?: SiigoErrorBody): string {
  if (!body?.Errors?.length) return "";
  return body.Errors.map((e) => `${e.Code}: ${e.Message}${e.Params?.length ? ` (${e.Params.join(", ")})` : ""}`).join(" | ");
}

/**
 * Siigo solo acepta llaves de idempotencia alfanuméricas: se deriva una de 32 caracteres (hex) estable
 * a partir del identificador interno, para que el mismo envío repetido no cree dos facturas.
 */
/** Errores de Siigo que indican una caída temporal del servicio (no un problema de los datos enviados). */
export function isSiigoUnavailable(status: number, message: string) {
  return status === 502 || status === 503 || status === 504 || /currently unavailable|service unavailable|try (again )?in a few minutes/i.test(message);
}

export function siigoIdempotencyKey(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 32);
}
