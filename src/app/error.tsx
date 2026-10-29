"use client";
import { useEffect, useState } from "react";

type Diag = { ok: boolean; checks: Record<string, string> };

// Atrapa errores de cualquier página, incluido el layout de /app. Muestra qué configuración falta.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  useEffect(() => {
    fetch("/api/diagnostico")
      .then((r) => r.json())
      .then(setDiag)
      .catch(() => setDiag(null));
  }, []);
  const failing = diag ? Object.entries(diag.checks).filter(([, v]) => v !== "ok" && !v.startsWith("pendiente")) : [];

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="card w-full max-w-lg space-y-4 p-8">
        <h1 className="text-xl font-semibold">No pudimos cargar esta página</h1>
        {failing.length > 0 ? (
          <>
            <p className="text-sm text-slate-600">La configuración del servidor está incompleta:</p>
            <ul className="space-y-2 text-sm">
              {failing.map(([k, v]) => (
                <li key={k} className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                  <b className="font-mono">{k}</b>: {v}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Corrige las variables en Vercel y haz Redeploy.</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {diag ? "La configuración se ve bien; intenta de nuevo en un momento." : "Revisando la configuración…"}
          </p>
        )}
        {error.digest && <p className="font-mono text-xs text-slate-400">Código: {error.digest}</p>}
        <div className="flex gap-2">
          <button onClick={reset} className="btn-primary">Reintentar</button>
          <a href="/" className="btn-secondary">Ir al inicio</a>
        </div>
      </div>
    </div>
  );
}
