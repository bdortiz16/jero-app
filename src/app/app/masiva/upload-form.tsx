"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { parseFile } from "@/lib/batch/parse";
import { ProgressPanel, type ProgressState } from "@/components/progress";
import { uploadBatchRows } from "../actions";

/** Las fechas de Excel se envían como texto AAAA-MM-DD (el servidor las vuelve a interpretar). */
const plain = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v])));

const isMovementsFile = (rows: Record<string, unknown>[]) =>
  rows.slice(0, 10).some(
    (r) =>
      Object.keys(r).some((k) => /identificacion|facturas_por_emitir|valor_a_facturar/.test(k)) ||
      Object.values(r).some((v) => typeof v === "string" && /identificaci[oó]n|facturas por emitir/i.test(v)),
  );

type Column = { key: string; required: boolean; help: string };
export type ModelOption = { id: number; name: string; defaultPct: number; ivaIncluded: boolean; retention: boolean };

export function UploadForm({ models, standardColumns, commissionColumns }: { models: ModelOption[]; standardColumns: Column[]; commissionColumns: Column[] }) {
  const [modelId, setModelId] = useState<string>(models[0] ? String(models[0].id) : "");
  const model = models.find((m) => String(m.id) === modelId);
  const columns = model ? commissionColumns : standardColumns;
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ProgressState | null>(null);
  const [wrongFile, setWrongFile] = useState(false);
  const busy = state?.kind === "working";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setWrongFile(false);
    try {
      setState({ kind: "working", title: "1 de 3 · Leyendo el archivo…", detail: file.name, percent: 10 });
      const rows = await parseFile(file.name, await file.arrayBuffer());
      if (isMovementsFile(rows)) {
        setWrongFile(true);
        setState(null);
        return;
      }
      setState({
        kind: "working",
        title: `2 de 3 · Validando ${rows.length.toLocaleString("es-CO")} filas y calculando facturas…`,
        detail: model ? `${model.name} · comisión ${pctRef.current?.value}%` : "Formato estándar",
        percent: 45,
      });
      const res = await uploadBatchRows({
        fileName: file.name,
        name: nameRef.current?.value ?? "",
        modelId: model?.id ?? null,
        pct: pctRef.current?.value ?? "",
        rows: plain(rows),
      });
      // Si todo sale bien, el servidor redirige al lote; si vuelve aquí, es un error.
      if (res?.error) setState({ kind: "error", title: "No se pudo crear el lote", detail: res.error });
      else setState({ kind: "done", title: "3 de 3 · Lote creado. Abriendo…", percent: 100 });
    } catch (err) {
      const msg = (err as Error).message;
      if (/NEXT_REDIRECT/.test(msg)) return;
      setState({ kind: "error", title: "No se pudo procesar el archivo", detail: msg });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <h2 className="mb-4 font-semibold">1. Sube el archivo</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="modelId">Modelo</label>
            <select id="modelId" name="modelId" className="input" value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value="">Estándar (una fila por ítem)</option>
            </select>
          </div>
          {model && (
            <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
              <label className="label" htmlFor="pct">% de comisión para este lote</label>
              <div className="flex items-center gap-2">
                <input ref={pctRef} id="pct" name="pct" type="number" step="0.0001" min="0" max="100" required className="input max-w-[140px]" defaultValue={model.defaultPct} key={model.id} />
                <span className="text-sm text-slate-600">
                  % del valor dispersado {model.ivaIncluded ? "(IVA incluido)" : "+ IVA aparte"}
                  {model.retention && " · Retefuente solo a personas jurídicas"}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="name">Nombre del lote (opcional)</label>
            <input ref={nameRef} id="name" name="name" className="input" placeholder={model ? "Dispersiones 30 oct" : "Ventas octubre"} />
          </div>
          <div>
            <label className="label" htmlFor="file">Archivo .xlsx o .csv</label>
            <input ref={fileRef} id="file" name="file" type="file" accept=".csv,.xlsx" required disabled={busy} className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
          </div>
          {wrongFile && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este archivo es de <b>movimientos</b> (Facturas por emitir). Se carga en la sección Movimientos.{" "}
              <Link href="/app/movimientos" className="font-medium underline">Ir a Movimientos →</Link>
            </div>
          )}
          {state && <ProgressPanel state={state} />}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className="btn-primary">{busy ? "Procesando…" : "Validar archivo"}</button>
            <a href={model ? "/api/plantilla?modelo=comision" : "/api/plantilla"} className="text-sm text-brand-700 hover:underline">Descargar plantilla</a>
          </div>
          <p className="text-xs text-slate-500">Nada se envía a Siigo hasta que revises y confirmes en el siguiente paso.</p>
        </form>
      </div>
      <div className="card text-sm">
        <h2 className="mb-3 font-semibold">Columnas del archivo</h2>
        <p className="mb-3 text-slate-500">
          {model ? "Una fila por operación: cada una genera su factura con el ítem de terceros y la comisión." : "Una fila por ítem. Las filas con la misma referencia forman una factura."}
        </p>
        <ul className="space-y-1.5">
          {columns.map((c) => (
            <li key={c.key}>
              <code className="rounded bg-slate-100 px-1 text-xs">{c.key}</code>
              {c.required && <span className="text-red-600">*</span>} <span className="text-slate-500">— {c.help}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
