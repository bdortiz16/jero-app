"use client";
import { useEffect, useRef } from "react";

/** Ventana de confirmación propia de la app (reemplaza el aviso nativo del navegador). */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 font-semibold text-white">J</span>
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="text-sm text-slate-700">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" ref={confirmRef} className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Tabla de valores para mostrar dentro de la ventana. */
export function SummaryTable({ rows, total }: { rows: [string, string][]; total?: [string, string] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-slate-100">
            <td className="py-1.5 pr-4 text-slate-500">{k}</td>
            <td className="py-1.5 text-right tabular-nums">{v}</td>
          </tr>
        ))}
        {total && (
          <tr>
            <td className="pt-2 pr-4 font-semibold">{total[0]}</td>
            <td className="pt-2 text-right font-semibold tabular-nums">{total[1]}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
