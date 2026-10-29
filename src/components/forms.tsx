"use client";
import { useActionState, useTransition, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/app/actions";
import { Alert } from "./ui";

export function Submit({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Procesando…" : children}
    </button>
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
}: {
  action: () => Promise<ActionState | void>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            try {
              setMsg((await action()) ?? null);
            } catch (e) {
              setMsg({ error: (e as Error).message });
            }
          });
        }}
      >
        {pending ? "Procesando…" : children}
      </button>
      {msg?.error && <span className="max-w-xs text-right text-xs text-red-600">{msg.error}</span>}
      {msg?.ok && <span className="text-xs text-emerald-700">{msg.ok}</span>}
    </span>
  );
}
