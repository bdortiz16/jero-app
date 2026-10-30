"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { uploadBatch } from "../actions";

type Column = { key: string; required: boolean; help: string };
export type ModelOption = { id: number; name: string; defaultPct: number; ivaIncluded: boolean; retention: boolean };

export function UploadForm({ models, standardColumns, commissionColumns }: { models: ModelOption[]; standardColumns: Column[]; commissionColumns: Column[] }) {
  const [modelId, setModelId] = useState<string>(models[0] ? String(models[0].id) : "");
  const model = models.find((m) => String(m.id) === modelId);
  const columns = model ? commissionColumns : standardColumns;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <h2 className="mb-4 font-semibold">1. Sube el archivo</h2>
        <ActionForm action={uploadBatch} className="space-y-4">
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
                <input id="pct" name="pct" type="number" step="0.0001" min="0" max="100" required className="input max-w-[140px]" defaultValue={model.defaultPct} key={model.id} />
                <span className="text-sm text-slate-600">
                  % del valor dispersado {model.ivaIncluded ? "(IVA incluido)" : "+ IVA aparte"}
                  {model.retention && " · Retefuente solo a personas jurídicas"}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="name">Nombre del lote (opcional)</label>
            <input id="name" name="name" className="input" placeholder={model ? "Dispersiones 30 oct" : "Ventas octubre"} />
          </div>
          <div>
            <label className="label" htmlFor="file">Archivo .xlsx o .csv</label>
            <input id="file" name="file" type="file" accept=".csv,.xlsx" required className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
          </div>
          <div className="flex items-center gap-3">
            <Submit>Validar archivo</Submit>
            <a href={model ? "/api/plantilla?modelo=comision" : "/api/plantilla"} className="text-sm text-brand-700 hover:underline">Descargar plantilla</a>
          </div>
          <p className="text-xs text-slate-500">Nada se envía a Siigo hasta que revises y confirmes en el siguiente paso.</p>
        </ActionForm>
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
