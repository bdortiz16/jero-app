"use client";
import { useEffect, useState } from "react";

type Diag = {
  ok: boolean;
  checks: Record<string, string>;
  tiempos?: Record<string, string>;
  plataforma?: Record<string, string>;
  errores?: { digest: string | null; path: string | null; message: string; at: string }[] | string;
  base?: { actividad?: { pid: number; estado: string; espera: string | null; segundos: number; consulta: string }[]; tablas?: Record<string, boolean>; error?: string } | null;
};

// Atrapa errores de cualquier página, incluido el layout de /app. Muestra qué configuración falta y datos técnicos.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/diagnostico")
      .then((r) => r.json())
      .then(setDiag)
      .catch(() => setDiag(null))
      .finally(() => setLoading(false));
  }, []);
  const failing = diag ? Object.entries(diag.checks).filter(([, v]) => v !== "ok" && !v.startsWith("pendiente")) : [];
  const stuck = diag?.base?.actividad?.filter((a) => a.segundos > 10) ?? [];
  const logged = Array.isArray(diag?.errores) ? diag.errores : [];
  const real = logged.find((e) => error.digest && e.digest === error.digest) ?? logged[0];
  const missingTables = Object.entries(diag?.base?.tablas ?? {}).filter(([, ok]) => !ok).map(([t]) => t);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="card w-full max-w-2xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">No pudimos cargar esta página</h1>
        {failing.length > 0 && (
          <>
            <p className="text-sm text-slate-600">La configuración del servidor está incompleta:</p>
            <ul className="space-y-2 text-sm">
              {failing.map(([k, v]) => (
                <li key={k} className="rounded-lg bg-red-50 px-3 py-2 text-red-800"><b className="font-mono">{k}</b>: {v}</li>
              ))}
            </ul>
          </>
        )}
        {stuck.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Hay {stuck.length} consulta(s) trabada(s) en la base.{" "}
            <a className="font-medium underline" href="/api/diagnostico?liberar=1" target="_blank">Liberar bloqueos</a> y luego pulsa Reintentar.
          </div>
        )}
        {missingTables.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Faltan tablas: {missingTables.join(", ")}. Haz Redeploy en Vercel.</div>
        )}
        {!loading && failing.length === 0 && stuck.length === 0 && missingTables.length === 0 && (
          <p className="text-sm text-slate-600">La configuración se ve bien. Pulsa Reintentar; si se repite, envía una captura de esta pantalla.</p>
        )}

        <details open className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium">Detalles técnicos</summary>
          <div className="mt-2 space-y-1 font-mono break-all">
            <div>error: {error.message || "(sin mensaje)"}</div>
            {real && <div className="text-red-700">causa real{real.digest === error.digest ? "" : " (último error registrado)"}: {real.message} {real.path ? `— ${real.path}` : ""}</div>}
            {error.digest && <div>código: {error.digest}</div>}
            <div>página: {typeof window !== "undefined" ? window.location.pathname : ""}</div>
            {diag?.tiempos && <div>tiempos: {Object.entries(diag.tiempos).map(([k, v]) => `${k}=${v}`).join(" · ")}</div>}
            {diag?.plataforma && <div>servidor: {Object.values(diag.plataforma).join(" · ")}</div>}
            {diag?.base?.error && <div>base: {diag.base.error}</div>}
            {diag?.base?.actividad?.map((a) => (
              <div key={a.pid}>consulta {a.pid}: {a.estado} {a.espera ?? ""} {a.segundos}s — {a.consulta}</div>
            ))}
            {loading && <div>revisando el servidor…</div>}
          </div>
        </details>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-primary">Reintentar</button>
          <a href="/app" className="btn-secondary">Ir al inicio</a>
        </div>
      </div>
    </div>
  );
}
