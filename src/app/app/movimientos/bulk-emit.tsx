"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressPanel } from "@/components/progress";
import { ConfirmModal, SummaryTable } from "@/components/modal";
import { cancelEmissionJob, listPendingMovements, resumeEmissionJob, startEmissionJob } from "../actions";

type Item = { id: number; name: string; company: string; amount: number; rowNumber: number | null };
type Filters = { q: string; empresa: string; min: string; max: string; orden: string };
export type JobView = {
  id: number;
  status: string;
  total: number;
  ok: number;
  failed: number;
  cursor: number;
  createdAt: string | Date;
  finishedAt: string | Date | null;
  log: { id: number; name: string; status: "ok" | "error"; text: string; at: string }[];
  current: { id: number; name: string; text: string }[];
  error: string | null;
  stalled?: boolean;
};

const money = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** "≈ 1 h 12 min", "≈ 8 min", "menos de 1 min" */
function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "calculando…";
  if (seconds < 60) return "menos de 1 min";
  const m = Math.round(seconds / 60);
  if (m < 60) return `≈ ${m} min`;
  return `≈ ${Math.floor(m / 60)} h ${m % 60} min`;
}

export function BulkEmit({ filters, initialJob }: { filters: Filters; initialJob: JobView | null }) {
  const { q, empresa, min, max, orden } = filters;
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(initialJob);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<{ items: Item[]; filtro: string; incluirErrores: boolean } | null>(null);
  // Se toma la hora solo en el navegador (si no, el HTML del servidor no coincide al hidratar).
  const [now, setNow] = useState<number | null>(null);
  const lastDone = useRef(job ? job.ok + job.failed : 0);

  const running = job?.status === "running";

  // Consulta el avance al servidor mientras corre (la emisión no depende de esta pestaña).
  const poll = useCallback(async () => {
    if (!job) return;
    try {
      const res = await fetch(`/api/jobs/emitir?id=${job.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as JobView;
      setJob(data);
      const done = data.ok + data.failed;
      if (done !== lastDone.current || data.status !== "running") {
        lastDone.current = done;
        router.refresh();
      }
    } catch {
      // sin conexión momentánea: se reintenta en el siguiente ciclo
    }
  }, [job, router]);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const t = setInterval(poll, 3000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [running, poll]);

  async function prepare(incluirErrores: boolean) {
    setMessage(null);
    setPreparing(true);
    try {
      const items = await listPendingMovements({ q, empresa, min, max, orden, incluirErrores });
      if (!items.length) {
        setMessage(incluirErrores ? "No hay movimientos pendientes ni con error para emitir." : "No hay movimientos pendientes para emitir con estos filtros.");
        return;
      }
      const filtro = [
        empresa && `empresa ${empresa}`,
        q && `búsqueda "${q}"`,
        min && `desde ${money(Number(min.replace(/[.$\s]/g, "")))}`,
        max && `hasta ${money(Number(max.replace(/[.$\s]/g, "")))}`,
        orden === "menor" && "de menor a mayor valor",
        orden === "mayor" && "de mayor a menor valor",
      ]
        .filter(Boolean)
        .join(", ");
      setPendingRun({ items, filtro, incluirErrores });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  async function start(incluirErrores: boolean) {
    setPendingRun(null);
    setPreparing(true);
    const res = await startEmissionJob({ q, empresa, min, max, orden, incluirErrores });
    setPreparing(false);
    if (res.error || !res.jobId) {
      setMessage(res.error ?? "No se pudo iniciar");
      return;
    }
    lastDone.current = 0;
    setJob({ id: res.jobId, status: "running", total: res.total ?? 0, ok: 0, failed: 0, cursor: 0, createdAt: new Date().toISOString(), finishedAt: null, log: [], current: [], error: null });
  }

  const byCompany = pendingRun
    ? Object.entries(
        pendingRun.items.reduce<Record<string, { n: number; v: number }>>((acc, i) => {
          acc[i.company] = { n: (acc[i.company]?.n ?? 0) + 1, v: (acc[i.company]?.v ?? 0) + i.amount };
          return acc;
        }, {}),
      )
    : [];

  // Ritmo y tiempo estimado (con el tiempo transcurrido desde que empezó)
  const done = job ? job.ok + job.failed : 0;
  const end = job?.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const elapsed = job && end ? (end - new Date(job.createdAt).getTime()) / 1000 : 0;
  const rate = elapsed > 5 && done > 0 ? done / elapsed : 0; // facturas por segundo
  const remaining = job ? Math.max(job.total - done, 0) : 0;
  const eta = rate ? remaining / rate : NaN;
  const pct = job?.total ? (done / job.total) * 100 : 0;

  return (
    <div className="card mb-6">
      <ConfirmModal
        open={!!pendingRun}
        title="Emitir facturas masivamente"
        confirmLabel={`Emitir ${pendingRun?.items.length.toLocaleString("es-CO") ?? ""} facturas`}
        onCancel={() => setPendingRun(null)}
        onConfirm={() => start(pendingRun!.incluirErrores)}
      >
        {pendingRun && (
          <div className="space-y-3">
            <p>
              Se emitirán <b>{pendingRun.items.length.toLocaleString("es-CO")}</b> facturas en Siigo
              {pendingRun.filtro ? ` (${pendingRun.filtro})` : ""}, con el modelo activo.
            </p>
            <SummaryTable
              rows={byCompany.map(([c, x]) => [`${c} · ${x.n.toLocaleString("es-CO")} facturas`, money(x.v)] as [string, string])}
              total={["Valor dispersado total", money(pendingRun.items.reduce((s, i) => s + i.amount, 0))]}
            />
            <p className="text-xs text-slate-500">
              Se emite en el servidor, en segundo plano: puedes cerrar esta pestaña o seguir usando la app. Tiempo estimado:{" "}
              {duration(pendingRun.items.length / 0.6)}.
            </p>
          </div>
        )}
      </ConfirmModal>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Emisión masiva</h2>
          <p className="text-sm text-slate-500">
            Emite en Siigo los movimientos pendientes{empresa || q || min || max ? " del filtro actual" : ""}
            {orden === "menor" ? ", empezando por el de menor valor" : orden === "mayor" ? ", empezando por el de mayor valor" : ""}. Corre en segundo
            plano en el servidor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running && (
            <>
              <button className="btn-primary" disabled={preparing} onClick={() => prepare(false)}>
                {preparing ? "Preparando…" : "Emitir masivamente"}
              </button>
              <button className="btn-secondary" disabled={preparing} onClick={() => prepare(true)}>Reintentar los con error</button>
            </>
          )}
          {running && job?.stalled && (
            <button className="btn-secondary" onClick={async () => { await resumeEmissionJob(job.id); poll(); }}>Reanudar</button>
          )}
          {running && (
            <button
              className="btn-danger"
              onClick={async () => {
                await cancelEmissionJob(job!.id);
                poll();
              }}
            >
              Detener
            </button>
          )}
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-amber-700">{message}</p>}

      {job && (
        <div className="mt-4 space-y-3">
          <ProgressPanel
            state={{
              kind: job.status === "running" ? "working" : job.failed || job.status === "cancelled" ? "error" : "done",
              percent: pct,
              title:
                job.status === "running"
                  ? `Emitiendo: ${done.toLocaleString("es-CO")} de ${job.total.toLocaleString("es-CO")} · ${job.ok.toLocaleString("es-CO")} emitidas${job.failed ? ` · ${job.failed} con error` : ""}`
                  : job.status === "cancelled"
                    ? `Detenida: ${job.ok.toLocaleString("es-CO")} emitidas${job.failed ? ` · ${job.failed} con error` : ""} de ${job.total.toLocaleString("es-CO")}`
                    : `Terminado: ${job.ok.toLocaleString("es-CO")} emitidas${job.failed ? ` · ${job.failed} con error` : ""} de ${job.total.toLocaleString("es-CO")}`,
              detail:
                job.status === "running"
                  ? `Tiempo restante: ${duration(eta)}${rate ? ` · ritmo ${(rate * 60).toFixed(0)} facturas/min` : ""} · transcurrido ${duration(elapsed).replace("≈ ", "")}. ${
                      job.stalled ? "Parece detenida: pulsa Reanudar." : "Sigue en segundo plano aunque cierres esta pestaña."
                    }`
                  : `Duración total: ${duration(elapsed).replace("≈ ", "")}.`,
            }}
          />
          {job.error && job.status === "running" && <p className="text-xs text-red-600">Último aviso del servidor: {job.error}</p>}
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>
                {job.status === "running" &&
                  job.current.map((c) => (
                    <tr key={`c${c.id}`}>
                      <td>{c.name}</td>
                      <td><span className="text-blue-700">⏳ emitiendo…</span></td>
                      <td className="text-xs text-slate-600">{c.text}</td>
                    </tr>
                  ))}
                {job.log.map((l) => (
                  <tr key={`${l.id}-${l.at}`}>
                    <td><Link href={`/app/movimientos/${l.id}`} className="text-brand-700 hover:underline">{l.name}</Link></td>
                    <td>{l.status === "ok" ? <span className="text-emerald-700">✓ emitida</span> : <span className="text-red-700">✕ error</span>}</td>
                    <td className={`text-xs ${l.status === "error" ? "text-red-700" : "text-slate-600"}`}>{l.text}</td>
                  </tr>
                ))}
                {!job.current.length && !job.log.length && (
                  <tr><td colSpan={3} className="py-4 text-center text-sm text-slate-500">Iniciando en el servidor…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
