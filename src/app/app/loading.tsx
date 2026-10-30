export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-64 rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-200" />)}
      </div>
      <div className="h-96 rounded-xl bg-slate-200" />
    </div>
  );
}
