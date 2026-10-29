"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Mientras el lote está en proceso, pide al servidor que envíe bloques hasta terminar. */
export function BatchRunner({ batchId, total }: { batchId: number; total: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ sent: number; errors: number; pending: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    let stop = false;
    (async () => {
      let lastRefresh = 0;
      while (!stop) {
        if (pausedRef.current) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        try {
          const res = await fetch(`/api/batches/${batchId}/process`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
          setError(null);
          if (data.sent !== undefined) setProgress({ sent: data.sent, errors: data.errors, pending: data.pending });
          if (data.status !== "processing" || data.pending === 0) {
            router.refresh();
            return;
          }
          if (Date.now() - lastRefresh > 5000) {
            router.refresh();
            lastRefresh = Date.now();
          }
        } catch (e) {
          setError((e as Error).message);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [batchId, router]);

  const done = progress ? progress.sent + progress.errors : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="card border-blue-200 bg-blue-50">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-blue-900">
          {paused ? "En pausa" : "Enviando facturas a Siigo…"} {progress && `${done} de ${total}`}
        </span>
        <button className="btn-secondary py-1" onClick={() => setPaused((p) => !p)}>{paused ? "Reanudar" : "Pausar"}</button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-blue-800">Mantén esta pestaña abierta hasta que termine. Si la cierras, puedes volver y continuará donde quedó.</p>
      {error && <p className="mt-2 text-xs text-red-700">Reintentando: {error}</p>}
    </div>
  );
}
