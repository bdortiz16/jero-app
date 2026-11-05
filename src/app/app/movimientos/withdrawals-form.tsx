"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseWithdrawalSheets } from "@/lib/withdrawals";
import { ProgressPanel, type ProgressState } from "@/components/progress";
import { importWithdrawalsChunk } from "../actions";

const CHUNK = 500;

/** Carga del archivo de cruce de retiros: el detalle de cada pago, para la consulta pública de pagos. */
export function ImportWithdrawalsForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ProgressState | null>(null);
  const busy = state?.kind === "working";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      setState({ kind: "working", title: "Leyendo el archivo…", detail: file.name });
      const { default: readXlsxFile } = await import("read-excel-file/universal");
      const parsed = parseWithdrawalSheets((await readXlsxFile(await file.arrayBuffer())) as never);
      // Un mismo retiro puede venir dos veces: en un bloque no puede repetirse (la base lo rechaza).
      const unique = [...new Map(parsed.rows.map((r) => [`${r.company}|${r.paidAt}|${r.idKey}|${r.netAmount}`, r])).values()];
      if (!unique.length) {
        setState({ kind: "error", title: "No se encontraron retiros", detail: 'El archivo debe tener hojas con las columnas "Fecha retiro", "Beneficiario", "Identificación", "Cuenta destino" e "Importe neto".' });
        return;
      }
      let saved = 0;
      for (let i = 0; i < unique.length; i += CHUNK) {
        setState({
          kind: "working",
          title: `Subiendo retiros: ${i.toLocaleString("es-CO")} de ${unique.length.toLocaleString("es-CO")}`,
          detail: `Hojas: ${parsed.sheets.join(", ")}`,
          percent: (i / unique.length) * 100,
        });
        const res = await importWithdrawalsChunk({ fileName: file.name, first: i === 0, total: unique.length, rows: unique.slice(i, i + CHUNK) });
        if (res.error) throw new Error(res.error);
        saved += res.saved ?? 0;
      }
      setState({
        kind: "done",
        percent: 100,
        title: `Listo: ${saved.toLocaleString("es-CO")} retiros cargados o actualizados`,
        detail: `Hojas: ${parsed.sheets.join(", ")}${parsed.skipped ? ` · ${parsed.skipped.toLocaleString("es-CO")} omitidos (traslados propios o sin beneficiario)` : ""}`,
      });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setState({ kind: "error", title: "No se pudo cargar el archivo", detail: (err as Error).message });
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <input ref={fileRef} type="file" accept=".xlsx" required disabled={busy} className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Cargando…" : "Cargar retiros"}</button>
      </div>
      {state && <ProgressPanel state={state} />}
    </form>
  );
}
