import { SiigoError, type SiigoCustomer, type SiigoInvoiceResponse, type SiigoProduct } from "./types";
import type { SiigoApi } from "./client";

// Simulación de Siigo para demos y pruebas (SIIGO_MOCK=true). Guarda estado en memoria.
const g = globalThis as unknown as { __siigoMock?: { seq: number; invoices: Map<string, SiigoInvoiceResponse>; keys: Map<string, string> } };
const state = (g.__siigoMock ??= { seq: 1000, invoices: new Map(), keys: new Map() });

const customers: SiigoCustomer[] = [
  { id: "c-1", person_type: "Company", id_type: { code: "31", name: "NIT" }, identification: "900123456", branch_office: 0, name: ["Comercializadora Andina SAS"], active: true, contacts: [{ email: "facturas@andina.co" }], address: { city: { city_name: "Bogotá" } } },
  { id: "c-2", person_type: "Person", id_type: { code: "13", name: "Cédula" }, identification: "1020304050", branch_office: 0, name: ["Laura", "Gómez"], active: true, contacts: [{ email: "laura@example.com" }], address: { city: { city_name: "Medellín" } } },
  { id: "c-3", person_type: "Company", id_type: { code: "31", name: "NIT" }, identification: "800987654", branch_office: 0, name: ["Distribuciones del Pacífico SAS"], active: true, address: { city: { city_name: "Cali" } } },
];

const products: SiigoProduct[] = [
  { id: "p-01", code: "01", name: "Comisión por Operaciones", active: true, taxes: [{ id: 1, name: "IVA 19%", percentage: 19 }] },
  { id: "p-02", code: "02", name: "Ingresos de Terceros", active: true, taxes: [] },
  { id: "p-1", code: "SERV-01", name: "Asesoría contable mensual", active: true, taxes: [{ id: 1, name: "IVA 19%", percentage: 19 }], prices: [{ currency_code: "COP", price_list: [{ position: 1, name: "General", value: 850000 }] }] },
  { id: "p-2", code: "SERV-02", name: "Declaración de renta", active: true, taxes: [{ id: 1, name: "IVA 19%", percentage: 19 }], prices: [{ currency_code: "COP", price_list: [{ position: 1, name: "General", value: 450000 }] }] },
  { id: "p-3", code: "PROD-01", name: "Libro contable físico", active: true, taxes: [{ id: 2, name: "IVA 5%", percentage: 5 }], prices: [{ currency_code: "COP", price_list: [{ position: 1, name: "General", value: 35000 }] }] },
];

const delay = () => new Promise((r) => setTimeout(r, 40));

export class SiigoMock implements SiigoApi {
  async testConnection() {
    await delay();
  }
  async documentTypes() {
    return [{ id: 24446, code: "1", name: "Factura electrónica de venta", type: "FV", active: true, electronic_type: "ElectronicInvoice", discount_type: "Value" as const }];
  }
  async taxes() {
    return [
      { id: 1, name: "IVA 19%", type: "IVA", percentage: 19, active: true },
      { id: 2, name: "IVA 5%", type: "IVA", percentage: 5, active: true },
      { id: 3, name: "Retefuente servicios 4%", type: "Retefuente", percentage: 4, active: true },
      { id: 4, name: "ReteICA 0.966%", type: "ReteICA", percentage: 0.966, active: true },
      { id: 5, name: "Retefuente comisiones 11%", type: "Retefuente", percentage: 11, active: true },
    ];
  }
  async paymentTypes() {
    return [
      { id: 5636, name: "Crédito", type: "Cartera", active: true, due_date: true },
      { id: 5637, name: "Efectivo", type: "Efectivo", active: true },
      { id: 5638, name: "Transferencia débito", type: "Efectivo", active: true },
    ];
  }
  async users() {
    return [{ id: 629, username: "vendedor@jero.co", first_name: "Vendedor", last_name: "Principal", email: "vendedor@jero.co", active: true }];
  }
  async costCenters() {
    return [{ id: 235, code: "1", name: "Principal", active: true }];
  }
  async customers(page: number, pageSize = 100) {
    const results = customers.slice((page - 1) * pageSize, page * pageSize);
    return { pagination: { page, page_size: pageSize, total_results: customers.length }, results };
  }
  async products(page: number, pageSize = 100) {
    const results = products.slice((page - 1) * pageSize, page * pageSize);
    return { pagination: { page, page_size: pageSize, total_results: products.length }, results };
  }
  async findCustomer(identification: string) {
    return customers.find((c) => c.identification === identification) ?? null;
  }
  async createCustomer(body: Parameters<SiigoApi["createCustomer"]>[0]) {
    await delay();
    if (customers.some((c) => c.identification === body.identification)) {
      throw new SiigoError("already_exists: el cliente ya existe", 400, { Errors: [{ Code: "already_exists", Message: "The customer already exists" }] });
    }
    const c: SiigoCustomer = {
      id: crypto.randomUUID(),
      person_type: body.person_type,
      id_type: { code: body.id_type, name: body.id_type === "31" ? "NIT" : "Cédula" },
      identification: body.identification,
      branch_office: 0,
      check_digit: body.check_digit,
      name: body.name,
      active: true,
    };
    customers.push(c);
    return c;
  }
  async createInvoice(body: Parameters<SiigoApi["createInvoice"]>[0], key?: string) {
    await delay();
    if (key && state.keys.has(key)) return state.invoices.get(state.keys.get(key)!)!;
    if (!customers.some((c) => c.identification === body.customer.identification)) {
      throw new SiigoError("invalid_reference: El cliente no existe (customer.identification)", 400, {
        Errors: [{ Code: "invalid_reference", Message: "The customer doesn't exist", Params: ["customer.identification"] }],
      });
    }
    const unknown = body.items.find((i) => !products.some((p) => p.code === i.code));
    if (unknown) {
      throw new SiigoError(`invalid_reference: El producto ${unknown.code} no existe`, 400, {
        Errors: [{ Code: "invalid_reference", Message: `The product ${unknown.code} doesn't exist`, Params: ["items.code"] }],
      });
    }
    const number = ++state.seq;
    const id = crypto.randomUUID();
    const total = body.payments.reduce((s, p) => s + p.value, 0);
    const inv: SiigoInvoiceResponse = {
      id,
      document: body.document,
      number,
      name: `FV-1-${number}`,
      date: body.date,
      total,
      stamp: body.stamp?.send ? { status: "Accepted", cufe: crypto.randomUUID().replace(/-/g, "") } : { status: "Draft" },
      mail: { status: body.mail?.send ? "sent" : "not_sent" },
      metadata: { created: new Date().toISOString() },
    };
    state.invoices.set(id, inv);
    if (key) state.keys.set(key, id);
    return inv;
  }
  async getInvoice(id: string) {
    const inv = state.invoices.get(id);
    if (!inv) throw new SiigoError("not_found", 404);
    return inv;
  }
  async invoicePdf(id: string) {
    const inv = state.invoices.get(id);
    if (!inv) throw new SiigoError("not_found", 404);
    return simplePdf([`Factura ${inv.name} (SIMULADA)`, `Fecha: ${inv.date}`, `Total: ${inv.total.toLocaleString("es-CO")}`, `CUFE: ${inv.stamp?.cufe ?? "-"}`]);
  }
}

/** PDF mínimo válido con unas líneas de texto (solo para el modo simulado). */
function simplePdf(lines: string[]): Uint8Array {
  const esc = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()\\]/g, "\\$&");
  const text = lines.map((l, i) => `BT /F1 14 Tf 60 ${760 - i * 24} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
