import { BrandLogo } from "./brand";
import Link from "next/link";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  draft: "bg-slate-100 text-slate-700",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
  active: "bg-emerald-100 text-emerald-800",
  disabled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  processing: "Enviando",
  sent: "Emitida",
  error: "Error",
  draft: "Por enviar",
  done: "Terminado",
  cancelled: "Cancelado",
  active: "Activo",
  disabled: "Bloqueado",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? "bg-slate-100 text-slate-700"}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: React.ReactNode }) {
  const s = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${s}`}>{children}</div>;
}

export function Pager({ page, hasMore, href }: { page: number; hasMore: boolean; href: (p: number) => string }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      {page > 1 && <Link className="btn-secondary" href={href(page - 1)}>Anterior</Link>}
      {hasMore && <Link className="btn-secondary" href={href(page + 1)}>Siguiente</Link>}
    </div>
  );
}

export function Logo({ className = "", tone = "light", size = 36 }: { className?: string; tone?: "light" | "dark"; size?: number }) {
  return <BrandLogo className={className} tone={tone} size={size} />;
}
