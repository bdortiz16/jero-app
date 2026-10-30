"use client";

export type ProgressState = {
  title: string;
  detail?: string;
  /** 0–100; undefined = trabajando sin porcentaje conocido */
  percent?: number;
  kind?: "working" | "done" | "error";
};

/** Cuadro de avance para cargas largas (leer archivo, subir por bloques, validar). */
export function ProgressPanel({ state }: { state: ProgressState }) {
  const color = state.kind === "error" ? "bg-red-500" : state.kind === "done" ? "bg-emerald-500" : "bg-brand-600";
  const box =
    state.kind === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : state.kind === "done"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-brand-100 bg-brand-50 text-brand-900";
  return (
    <div className={`rounded-lg border p-4 ${box}`} role="status" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{state.title}</span>
        {state.percent !== undefined && <span className="tabular-nums">{Math.round(state.percent)}%</span>}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/70">
        {state.percent === undefined && state.kind === "working" ? (
          <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-brand-600" />
        ) : (
          <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${state.percent ?? 100}%` }} />
        )}
      </div>
      {state.detail && <p className="mt-2 text-xs opacity-80">{state.detail}</p>}
    </div>
  );
}
