"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressPanel } from "@/components/progress";
import { ConfirmModal, SummaryTable } from "@/components/modal";
import { emitMovementAction, listPendingMovements } from "../actions";

type Item = { id: number; name: string; company: string; amount: number; rowNumber: number | null };
type LogLine = { id: number; name: string; status: "emitiendo" | "ok" | "error"; text?: string };

const money = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
// Dos a la vez: rápido sin chocar con el límite de peticiones de Siigo.
const PARALLEL = 2;

export function BulkEmit({ q, empresa }: { q: string; empresa: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "stopping" | "done">("idle");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [ok, setOk] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [pendingRun, setPendingRun] = useState<{ items: Item[]; filtro: string } | null>(null);

  const upsertLog = (line: LogLine) =>
    setLog((prev) => {
      const rest = prev.filter((l) => l.id !== line.id);
      return [line, ...rest].slice(0, 60);
    });

  async function start(incluirErrores: boolean) {
    setMessage(null);
    setPhase("loading");
    let items: Item[];
    try {
      items = await listPendingMovements({ q, empresa, incluirErrores });
    } catch (e) {
      setPhase("idle");
      setMessage((e as Error).message);
      return;
    }
    if (!items.length) {
      setPhase("idle");
      setMessage(incluirErrores ? "No hay movimientos pendientes ni con error para emitir." : "No hay movimientos pendientes para emitir con estos filtros.");
      return;
    }
    const filtro = [empresa && `empresa ${empresa}`, q && `búsqueda "${q}"`].filter(Boolean).join(", ");
    setPendingRun({ items, filtro });
    setPhase("idle");
  }

  async function run(items: Item[]) {
    stopRef.current = false;
    setTotal(items.length);
    setDone(0);
    setOk(0);
    setFailed(0);
    setLog([]);
    setPhase("running");

    let next = 0;
    const worker = async () => {
      while (!stopRef.current && next < items.length) {
        const it = items[next++];
        upsertLog({ id: it.id, name: it.name, status: "emitiendo", text: `${it.company} · ${money(it.amount)}` });
        let res: Awaited<ReturnType<typeof emitMovementAction>>;
        try {
          res = await emitMovementAction(it.id, { quiet: true });
        } catch (e) {
          res = { error: (e as Error).message };
        }
        if (res?.error) {
          setFailed((n) => n + 1);
          upsertLog({ id: it.id, name: it.name, status: "error", text: res.error });
        } else {
          setOk((n) => n + 1);
          upsertLog({ id: it.id, name: it.name, status: "ok", text: res?.number ?? "emitida" });
        }
        setDone((n) => n + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
    setPhase("done");
    router.refresh();
  }

  const running = phase === "running" || phase === "stopping";
  const byCompany = pendingRun
    ? Object.entries(
        pendingRun.items.reduce<Record<string, { n: number; v: number }>>((acc, i) => {
          acc[i.company] = { n: (acc[i.company]?.n ?? 0) + 1, v: (acc[i.company]?.v ?? 0) + i.amount };
          return acc;
        }, {}),
      )
    : [];
  const pct = total ? (done / total) * 100 : 0;

  return (
    <div className="card mb-6">
      <ConfirmModal
        open={!!pendingRun}
        title="Emitir facturas masivamente"
        confirmLabel={`Emitir ${pendingRun?.items.length.toLocaleString("es-CO") ?? ""} facturas`}
        onCancel={() => setPendingRun(null)}
        onConfirm={() => {
          const items = pendingRun!.items;
          setPendingRun(null);
          run(items);
        }}
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
            <p className="text-xs text-slate-500">Mantén esta pestaña abierta mientras termina. Puedes detener en cualquier momento.</p>
          </div>
        )}
      </ConfirmModal>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Emisión masiva</h2>
          <p className="text-sm text-slate-500">
            Emite en Siigo todos los movimientos pendientes{empresa || q ? " que coinciden con el filtro actual" : ""}, uno tras otro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running && (
            <>
              <button className="btn-primary" disabled={phase === "loading"} onClick={() => start(false)}>
                {phase === "loading" ? "Preparando…" : "Emitir masivamente"}
              </button>
              <button className="btn-secondary" disabled={phase === "loading"} onClick={() => start(true)}>Reintentar los con error</button>
            </>
          )}
          {running && (
            <button
              className="btn-danger"
              disabled={phase === "stopping"}
              onClick={() => {
                stopRef.current = true;
                setPhase("stopping");
              }}
            >
              {phase === "stopping" ? "Deteniendo…" : "Detener"}
            </button>
          )}
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-amber-700">{message}</p>}

      {phase !== "idle" && phase !== "loading" && total > 0 && (
        <div className="mt-4 space-y-3">
          <ProgressPanel
            state={{
              kind: phase === "done" ? (failed ? "error" : "done") : "working",
              percent: pct,
              title:
                phase === "done"
                  ? `Terminado: ${ok.toLocaleString("es-CO")} emitidas${failed ? ` · ${failed} con error` : ""} de ${total.toLocaleString("es-CO")}`
                  : `${phase === "stopping" ? "Deteniendo… " : "Emitiendo: "}${done.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} · ${ok.toLocaleString("es-CO")} emitidas${failed ? ` · ${failed} con error` : ""}`,
              detail: phase === "done" ? undefined : "Mantén esta pestaña abierta. Puedes detener en cualquier momento y continuar después.",
            }}
          />
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/app/movimientos/${l.id}`} className="text-brand-700 hover:underline">{l.name}</Link></td>
                    <td>
                      {l.status === "emitiendo" && <span className="text-blue-700">⏳ emitiendo…</span>}
                      {l.status === "ok" && <span className="text-emerald-700">✓ emitida</span>}
                      {l.status === "error" && <span className="text-red-700">✕ error</span>}
                    </td>
                    <td className={`text-xs ${l.status === "error" ? "text-red-700" : "text-slate-600"}`}>{l.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
