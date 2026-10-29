"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-xl font-semibold">No pudimos cargar esta página</h1>
      <p className="mt-3 text-sm text-slate-600">
        Ocurrió un error en el servidor. Si acabas de configurar la app, abre{" "}
        <a href="/api/diagnostico" className="text-brand-700 underline">/api/diagnostico</a> para ver qué falta (casi siempre es la base de datos).
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">Código: {error.digest}</p>}
      <button onClick={reset} className="btn-primary mt-6">Reintentar</button>
    </div>
  );
}
