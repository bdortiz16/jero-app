"use client";
import { useActionState, useEffect, useTransition, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/app/actions";
import { Alert } from "./ui";
import { ConfirmModal } from "./modal";

/** Aviso cuando una acción tarda demasiado (normalmente un bloqueo en la base de datos). */
export function SlowHint({ pending, after = 15000 }: { pending: boolean; after?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(t);
  }, [pending, after]);
  if (!slow) return null;
  return (
    <span className="block max-w-sm text-xs text-amber-700">
      Está tardando más de lo normal. Si no termina, abre{" "}
      <a href="/api/diagnostico?liberar=1" target="_blank" rel="noopener" className="underline">liberar bloqueos</a> y vuelve a intentar.
    </span>
  );
}

export function Submit({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="submit" disabled={pending} className={className}>
        {pending ? "Procesando…" : children}
      </button>
      <SlowHint pending={pending} />
    </span>
  );
}

/** Formulario conectado a una server action con estado { ok, error }. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error && <div className="mb-4"><Alert kind="error">{state.error}</Alert></div>}
      {state?.ok && <div className="mb-4"><Alert kind="success">{state.ok}</Alert></div>}
      {children}
    </form>
  );
}

/** Botón que ejecuta una server action sin formulario y muestra el resultado. */
export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  confirm,
  confirmTitle = "¿Confirmas?",
  confirmLabel = "Confirmar",
}: {
  action: () => Promise<ActionState | void>;
  children: React.ReactNode;
  className?: string;
  /** Texto o contenido de la ventana de confirmación (si se indica, se pide confirmar antes). */
  confirm?: React.ReactNode;
  confirmTitle?: string;
  confirmLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(null);
  const [asking, setAsking] = useState(false);
  const run = () =>
    start(async () => {
      try {
        setMsg((await action()) ?? null);
      } catch (e) {
        setMsg({ error: (e as Error).message });
      }
    });
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <ConfirmModal
        open={asking}
        title={confirmTitle}
        confirmLabel={confirmLabel}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          run();
        }}
      >
        {typeof confirm === "string" ? <p className="whitespace-pre-line">{confirm}</p> : confirm}
      </ConfirmModal>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => (confirm ? setAsking(true) : run())}
      >
        {pending ? "Procesando…" : children}
      </button>
      <SlowHint pending={pending} />
      {msg?.error && <span className="max-w-xs text-right text-xs text-red-600">{msg.error}</span>}
      {msg?.ok && <span className="text-xs text-emerald-700">{msg.ok}</span>}
    </span>
  );
}
