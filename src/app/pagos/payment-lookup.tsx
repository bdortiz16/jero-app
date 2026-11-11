"use client";
import { useState } from "react";
import { bankLabel } from "@/lib/withdrawals";
import type { InvoiceGroup, PeriodRow } from "@/lib/payments-lookup";
import { CREDIT_NOTE_REASONS } from "@/lib/credit-note-options";
import { consultarPagos, solicitarNotaCredito } from "./actions";

type Result = { beneficiary: string; identification: string; count: number; total: number; groups: InvoiceGroup[]; periods: PeriodRow[] };

const money = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" });
const invoiceDay = (d: string | null) => (d ? new Date(`${d}T12:00:00-05:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : null);

// Para abrir en Excel sin que un texto que empiece por = se ejecute como fórmula.
const cell = (v: unknown) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function downloadCsv(r: Result, doc: string) {
  const header = ["Factura", "Fecha del pago", "Pagado por", "Banco", "Valor en esta factura", "Valor total del pago"];
  const label = (g: InvoiceGroup, inv: string | null) => (g.kind === "pendiente" ? "Por facturar" : g.kind === "anterior" ? inv ?? "Anterior" : g.number ?? "");
  const lines = r.groups.flatMap((g) =>
    g.payments.map((p) =>
      [label(g, p.invoices), when(p.paidAt), p.company, bankLabel(p.bank), p.amount.toFixed(2).replace(".", ","), (p.full ?? p.amount).toFixed(2).replace(".", ",")]
        .map(cell)
        .join(";"),
    ),
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pagos-${doc.replace(/\D/g, "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Números de las facturas anteriores de un grupo, sin repetir y en orden. */
const refsOf = (g: InvoiceGroup) => [...new Set(g.payments.flatMap((p) => (p.invoices ?? "").split(/[,;]\s*/)).filter(Boolean))];

const pdfUrl = (id: number, doc: string, download = false) => `/api/pagos/factura/${id}?doc=${encodeURIComponent(doc)}${download ? "&descargar=1" : ""}`;

/** "¿No estás de acuerdo con esta factura?" → formulario corto para pedir nota crédito. */
function CreditNoteBox({ g, doc }: { g: InvoiceGroup; doc: string }) {
  const refs = g.kind === "anterior" ? refsOf(g) : [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "nueva" | "ya">(null);
  const [f, setF] = useState({ invoiceNumber: refs[0] ?? "", reason: "", detail: "", contactName: "", email: "", phone: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  if (sent) {
    return (
      <div className="border-t border-slate-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
        <b>{sent === "ya" ? "Ya tenemos tu solicitud en revisión." : "Recibimos tu solicitud de nota crédito."}</b> Te escribiremos a {f.email} cuando la
        revisemos.
      </div>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-sm text-slate-700">¿No estás de acuerdo con esta factura?</p>
        <button onClick={() => setOpen(true)} className="btn-secondary">Solicitar nota crédito</button>
      </div>
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await solicitarNotaCredito({ doc, invoiceId: g.invoiceId, ...f });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(r.already ? "ya" : "nueva");
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
      <div>
        <h3 className="font-semibold">Solicitar nota crédito{g.number ? ` de la factura ${g.number}` : ""}</h3>
        <p className="text-sm text-slate-600">Cuéntanos qué no está bien. Revisamos tu solicitud y te respondemos por correo.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {refs.length > 0 && (
          <div>
            <label className="label">Factura</label>
            <select value={f.invoiceNumber} onChange={set("invoiceNumber")} className="input" required>
              {refs.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div className={refs.length ? "" : "sm:col-span-2"}>
          <label className="label">Motivo</label>
          <select value={f.reason} onChange={set("reason")} className="input" required>
            <option value="">Elige un motivo…</option>
            {CREDIT_NOTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">¿Qué está mal?</label>
          <textarea value={f.detail} onChange={set("detail")} className="input min-h-[80px]" required minLength={10} maxLength={2000} placeholder="Ej.: el pago del 10 de abril por $ 5.000.000 no es mío." />
        </div>
        <div>
          <label className="label">Tu nombre</label>
          <input value={f.contactName} onChange={set("contactName")} className="input" required autoComplete="name" />
        </div>
        <div>
          <label className="label">Correo</label>
          <input type="email" value={f.email} onChange={set("email")} className="input" required autoComplete="email" />
        </div>
        <div>
          <label className="label">Celular (opcional)</label>
          <input value={f.phone} onChange={set("phone")} className="input" inputMode="tel" autoComplete="tel" />
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function GroupCard({ g, doc, open }: { g: InvoiceGroup; doc: string; open: boolean }) {
  const first = g.payments[0]?.paidAt;
  const last = g.payments[g.payments.length - 1]?.paidAt;
  const title = g.kind === "pendiente" ? "Pagos aún sin factura" : g.kind === "anterior" ? "Pagos facturados anteriormente" : `Factura ${g.number}`;
  return (
    <details open={open} className="card overflow-hidden p-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{title}</span>
            {g.kind === "jero" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Factura electrónica</span>}
            {g.kind === "anterior" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{refsOf(g).length} facturas anteriores</span>}
            {g.kind === "pendiente" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Por facturar</span>}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {g.payments.length} {g.payments.length === 1 ? "pago" : "pagos"}
            {first && ` · del ${shortDay(first)}${last && last !== first ? ` al ${shortDay(last)}` : ""}`}
            {invoiceDay(g.date) && ` · factura del ${invoiceDay(g.date)}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-500">Valor de los pagos</div>
            <div className="text-xl font-semibold tabular-nums">{money(g.total)}</div>
          </div>
          {g.invoiceId && (
            <a href={pdfUrl(g.invoiceId, doc)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="btn-primary whitespace-nowrap">
              Ver factura (PDF)
            </a>
          )}
        </div>
      </summary>
      <div className="overflow-x-auto border-t border-slate-200">
        <table className="table">
          <thead><tr><th>#</th><th>Fecha y hora del pago</th><th>Pagado por</th><th>Banco</th>{g.kind === "anterior" && <th>Factura</th>}<th className="text-right">Valor</th></tr></thead>
          <tbody>
            {g.payments.map((p, i) => (
              <tr key={`${p.paidAt}-${i}`}>
                <td className="text-slate-400">{i + 1}</td>
                <td className="whitespace-nowrap">{when(p.paidAt)}</td>
                <td>{p.company}</td>
                <td>{bankLabel(p.bank)}</td>
                {g.kind === "anterior" && <td className="whitespace-nowrap text-xs">{p.invoices}</td>}
                <td className="whitespace-nowrap text-right tabular-nums">
                  {money(p.amount)}
                  {p.full && <div className="text-xs text-slate-500">parte de un pago de {money(p.full)}</div>}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={g.kind === "anterior" ? 5 : 4}>Total {g.kind === "pendiente" ? "por facturar" : g.kind === "anterior" ? "facturado anteriormente" : `en la factura ${g.number}`}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{money(g.total)}</td>
            </tr>
          </tbody>
        </table>
        {g.kind === "anterior" && <p className="px-5 py-3 text-xs text-slate-500">Estas facturas se emitieron antes; si necesitas una copia, pídela a tu asesor.</p>}
      </div>
      {g.kind !== "pendiente" && <CreditNoteBox g={g} doc={doc} />}
    </details>
  );
}

export function PaymentLookup() {
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [asked, setAsked] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await consultarPagos(doc);
    setBusy(false);
    if (!r.ok) {
      setRes(null);
      setError(r.error);
      return;
    }
    setAsked(doc);
    setRes(r);
  }

  const invoices = res?.groups.filter((g) => g.kind !== "pendiente") ?? [];
  const pending = res?.groups.find((g) => g.kind === "pendiente");

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="doc">Cédula o NIT</label>
          <input id="doc" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" autoComplete="off" required className="input" placeholder="Ej. 1012345678 o 900123456" />
        </div>
        <button className="btn-primary h-[42px]" disabled={busy}>{busy ? "Consultando…" : "Consultar pagos"}</button>
      </form>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {res && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card"><div className="text-sm text-slate-500">Beneficiario</div><div className="mt-1 font-semibold">{res.beneficiary}</div><div className="text-xs text-slate-400">{res.identification}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Pagos recibidos</div><div className="mt-1 text-2xl font-semibold tabular-nums">{res.count.toLocaleString("es-CO")}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Total recibido</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(res.total)}</div></div>
          </div>

          {res.groups.length > 0 && (
            <>
              {/* Primero el resumen: qué facturas tiene y cuánto de sus pagos entró en cada una. */}
              <div className="card overflow-x-auto p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">Tus facturas</h2>
                    <p className="text-sm text-slate-500">Cada factura agrupa varios pagos. Abre una factura abajo para ver sus pagos uno por uno.</p>
                  </div>
                  <button onClick={() => downloadCsv(res, asked)} className="btn-secondary">Descargar en Excel (CSV)</button>
                </div>
                <table className="table">
                  <thead><tr><th>Factura</th><th>Fecha</th><th className="text-right"># pagos</th><th className="text-right">Valor de los pagos</th><th></th></tr></thead>
                  <tbody>
                    {invoices.map((g) => (
                      <tr key={g.key}>
                        <td className="font-medium">
                          {g.kind === "anterior" ? (
                            <>Facturas anteriores<div className="max-w-md text-xs font-normal text-slate-500">{refsOf(g).join(", ")}</div></>
                          ) : (
                            g.number
                          )}
                        </td>
                        <td className="whitespace-nowrap">{invoiceDay(g.date) ?? <span className="text-slate-400">Anterior</span>}</td>
                        <td className="text-right tabular-nums">{g.payments.length}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{money(g.total)}</td>
                        <td className="text-right">
                          {g.invoiceId ? (
                            <a href={pdfUrl(g.invoiceId, asked)} target="_blank" rel="noopener" className="text-brand-700 hover:underline">Ver PDF</a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {pending && (
                      <tr className="text-amber-800">
                        <td className="font-medium">Por facturar</td>
                        <td></td>
                        <td className="text-right tabular-nums">{pending.payments.length}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{money(pending.total)}</td>
                        <td></td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 text-base font-semibold">
                      <td>Total</td>
                      <td></td>
                      <td className="text-right tabular-nums">{res.groups.reduce((s, g) => s + g.payments.length, 0)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(res.groups.reduce((s, g) => s + g.total, 0))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                {/* La factura más reciente de Jero se muestra abierta; las demás se abren con un clic. */}
                {res.groups.map((g) => (
                  <GroupCard key={g.key} g={g} doc={asked} open={g === res.groups[0] && g.kind === "jero"} />
                ))}
              </div>
            </>
          )}

          {res.groups.length === 0 && res.periods.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Pagado por</th><th>Desde</th><th>Hasta</th><th className="text-right"># pagos</th><th className="text-right">Valor</th><th>Factura</th></tr></thead>
                <tbody>
                  {res.periods.map((p, i) => (
                    <tr key={i}>
                      <td>{p.company}</td>
                      <td className="whitespace-nowrap">{p.from ? new Date(p.from).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "—"}</td>
                      <td className="whitespace-nowrap">{p.to ? new Date(p.to).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "—"}</td>
                      <td className="text-right tabular-nums">{p.withdrawals ?? "—"}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(p.amount)}</td>
                      <td className="whitespace-nowrap">
                        {p.invoice ?? <span className="text-slate-400">Por facturar</span>}
                        {p.invoiceId && <a href={pdfUrl(p.invoiceId, asked)} target="_blank" rel="noopener" className="ml-2 text-brand-700 hover:underline">Ver PDF</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-5 py-3 text-xs text-slate-500">Resumen por periodo. El detalle pago por pago estará disponible pronto.</p>
            </div>
          )}
          <p className="text-xs text-slate-500">"Pagado por" es la empresa que hizo el pago; en tu banco llega a nombre de Soluciones y Pagos o RICE, procesadoras de pagos aliadas de JERO. Valor = lo que llegó a tu cuenta. Si un pago se facturó en dos partes, aparece en las dos facturas con el valor de cada parte.</p>
        </div>
      )}
    </div>
  );
}
