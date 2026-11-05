"use client";
import { useState } from "react";
import { bankLabel } from "@/lib/withdrawals";
import type { PaymentRow } from "@/lib/payments-lookup";
import { consultarPagos } from "./actions";

const money = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const monthOf = (iso: string) => {
  const m = new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// Para abrir en Excel sin que un texto que empiece por = se ejecute como fórmula.
const cell = (v: unknown) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function downloadCsv(rows: PaymentRow[], doc: string) {
  const header = ["Fecha", "Pagado por", "Beneficiario", "Identificación", "Banco", "Cuenta", "Valor", "Factura"];
  const lines = rows.map((r) =>
    [when(r.paidAt), r.company, r.beneficiary, r.identification, bankLabel(r.bank), r.accountLast4 ? `****${r.accountLast4}` : "", r.amount.toFixed(2).replace(".", ","), r.invoice ?? ""]
      .map(cell)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pagos-${doc.replace(/\D/g, "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PaymentLookup() {
  const [doc, setDoc] = useState("");
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await consultarPagos(doc, last4);
    setBusy(false);
    if (!res.ok) {
      setRows(null);
      setError(res.error);
      return;
    }
    setRows(res.rows);
  }

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const months = rows
    ? rows.reduce<{ month: string; rows: PaymentRow[] }[]>((acc, r) => {
        const m = monthOf(r.paidAt);
        if (acc[acc.length - 1]?.month !== m) acc.push({ month: m, rows: [] });
        acc[acc.length - 1].rows.push(r);
        return acc;
      }, [])
    : [];

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="doc">Cédula o NIT</label>
          <input id="doc" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" autoComplete="off" required className="input" placeholder="Ej. 1012345678 o 900123456" />
        </div>
        <div>
          <label className="label" htmlFor="last4">Últimos 4 dígitos de tu cuenta</label>
          <input id="last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" required className="input" placeholder="Ej. 1234" />
        </div>
        <button className="btn-primary h-[42px]" disabled={busy}>{busy ? "Consultando…" : "Consultar pagos"}</button>
        <p className="text-xs text-slate-500 sm:col-span-3">
          Los últimos 4 dígitos de la cuenta bancaria donde recibes los pagos protegen tu información: sin ellos nadie más puede ver tus pagos.
        </p>
      </form>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {rows && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card"><div className="text-sm text-slate-500">Beneficiario</div><div className="mt-1 font-semibold">{rows[0]?.beneficiary}</div><div className="text-xs text-slate-400">{rows[0]?.identification}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Pagos recibidos</div><div className="mt-1 text-2xl font-semibold tabular-nums">{rows.length.toLocaleString("es-CO")}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Total recibido</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(total)}</div></div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => downloadCsv(rows, doc)} className="btn-secondary">Descargar en Excel (CSV)</button>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead><tr><th>Fecha y hora</th><th>Pagado por</th><th>Banco</th><th>Cuenta</th><th className="text-right">Valor</th><th>Factura</th></tr></thead>
              {months.map((m) => (
                <tbody key={m.month}>
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="font-semibold">{m.month} · {m.rows.length} {m.rows.length === 1 ? "pago" : "pagos"}</td>
                    <td className="text-right font-semibold tabular-nums">{money(m.rows.reduce((s, r) => s + r.amount, 0))}</td>
                    <td></td>
                  </tr>
                  {m.rows.map((r, i) => (
                    <tr key={`${r.paidAt}-${i}`}>
                      <td className="whitespace-nowrap">{when(r.paidAt)}</td>
                      <td>{r.company}</td>
                      <td>{bankLabel(r.bank)}</td>
                      <td className="font-mono text-xs">{r.accountLast4 ? `****${r.accountLast4}` : "—"}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(r.amount)}</td>
                      <td className="whitespace-nowrap">{r.invoice ?? <span className="text-slate-400">Por facturar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Valor = lo que llegó a tu cuenta. Si un pago dice &quot;Por facturar&quot;, su factura electrónica aún no se ha emitido.
          </p>
        </div>
      )}
    </div>
  );
}
