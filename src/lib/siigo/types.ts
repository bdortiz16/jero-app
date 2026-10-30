// Contrato de la API de Siigo Nube (https://api.siigo.com).
// Referencia: https://siigoapi.docs.apiary.io  /  developers.siigo.com
// Si tu documentación difiere, este es el único archivo de tipos a ajustar.

export type SiigoTokenResponse = {
  access_token: string;
  expires_in: number; // segundos (normalmente 86400)
  token_type: string;
  scope?: string;
};

export type SiigoDocumentType = {
  id: number;
  code: string;
  name: string;
  type: string; // FV, NC, RC...
  active: boolean;
  seller_by_item?: boolean;
  cost_center?: boolean;
  cost_center_mandatory?: boolean;
  automatic_number?: boolean;
  consecutive?: number;
  electronic_type?: string; // ElectronicInvoice | NoElectronic ...
  discount_type?: "Percentage" | "Value";
};

export type SiigoTax = {
  id: number;
  name: string;
  type: string; // IVA | Retefuente | ReteICA | ReteIVA | Impoconsumo ...
  percentage: number;
  active: boolean;
};

export type SiigoPaymentType = {
  id: number;
  name: string;
  type: string; // Efectivo | Cartera | Tarjeta ...
  active: boolean;
  due_date?: boolean;
};

export type SiigoUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  active: boolean;
};

export type SiigoCostCenter = { id: number; code: string; name: string; active: boolean };

export type SiigoCustomer = {
  id: string;
  type?: string;
  person_type: "Person" | "Company";
  id_type?: { code: string; name: string };
  identification: string;
  branch_office: number;
  check_digit?: string;
  name: string[];
  commercial_name?: string;
  active: boolean;
  address?: { address?: string; city?: { city_name?: string; state_name?: string } };
  phones?: { number?: string }[];
  contacts?: { first_name?: string; last_name?: string; email?: string }[];
};

export type SiigoCustomerRequest = {
  type: "Customer";
  person_type: "Person" | "Company";
  id_type: string; // 13 cédula, 31 NIT
  identification: string;
  check_digit?: string;
  name: string[];
  branch_office: number;
  active: boolean;
  vat_responsible: boolean;
  fiscal_responsibilities: { code: string }[];
  address: { address: string; city: { country_code: string; state_code: string; city_code: string } };
  phones?: { number: string }[];
  contacts?: { first_name: string; last_name: string; email: string }[];
};

export type SiigoProduct = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  type?: string;
  taxes?: { id: number; name: string; percentage: number }[];
  prices?: { currency_code: string; price_list: { position: number; name: string; value: number }[] }[];
};

export type SiigoPaged<T> = {
  pagination: { page: number; page_size: number; total_results: number };
  results: T[];
};

export type SiigoInvoiceRequest = {
  document: { id: number };
  date: string; // YYYY-MM-DD
  customer: { identification: string; branch_office: number };
  cost_center?: number;
  seller: number;
  observations?: string;
  items: {
    code: string;
    description?: string;
    quantity: number;
    price: number;
    discount?: number;
    taxes?: { id: number }[];
  }[];
  payments: { id: number; value: number; due_date?: string }[];
  stamp?: { send: boolean };
  mail?: { send: boolean };
};

export type SiigoInvoiceResponse = {
  id: string;
  document: { id: number };
  prefix?: string;
  number: number;
  name: string; // p.ej. "FV-1-1234"
  date: string;
  total: number;
  balance?: number;
  stamp?: { status?: string; cufe?: string; observations?: string; errors?: string };
  mail?: { status?: string; observations?: string };
  metadata?: { created: string };
};

export type SiigoErrorBody = {
  Status?: number;
  Errors?: { Code: string; Message: string; Params?: string[]; Detail?: string }[];
};

export class SiigoError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: SiigoErrorBody,
  ) {
    super(message);
    this.name = "SiigoError";
  }
  /** Errores que vale la pena reintentar (límite de peticiones, caídas temporales). */
  get retryable() {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}
