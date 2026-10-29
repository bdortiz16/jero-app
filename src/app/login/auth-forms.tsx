"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { devSignInAction, resetAction, signInAction, signUpAction, type AuthState } from "./actions";

type Mode = "login" | "signup" | "reset";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
      {pending ? "Un momento…" : children}
    </button>
  );
}

function Form({ action, children }: { action: (s: AuthState, fd: FormData) => Promise<AuthState>; children: (email?: string) => React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok ? <Alert kind="success">{state.ok}</Alert> : children(state?.email)}
    </form>
  );
}

// React vacía el formulario tras enviarlo: se conserva el correo escrito para no tener que repetirlo.
const Email = ({ value }: { value?: string }) => (
  <div>
    <label className="label" htmlFor="email">Correo</label>
    <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="tu@empresa.com" defaultValue={value} key={value} />
  </div>
);

const Password = ({ name = "password", label = "Contraseña", autoComplete = "current-password" }) => (
  <div>
    <label className="label" htmlFor={name}>{label}</label>
    <input id={name} name={name} type="password" required minLength={name === "password" && autoComplete === "current-password" ? undefined : 8} autoComplete={autoComplete} className="input" />
  </div>
);

export function AuthForms({ devLogin }: { devLogin: boolean }) {
  const [mode, setMode] = useState<Mode>("login");
  const link = (m: Mode, text: string) => (
    <button type="button" onClick={() => setMode(m)} className="text-brand-700 hover:underline">{text}</button>
  );

  return (
    <div className="space-y-5">
      {mode === "login" && (
        <>
          <Form action={signInAction} key="login">
            {(email) => (
              <>
                <Email value={email} />
                <Password />
                <Submit>Iniciar sesión</Submit>
              </>
            )}
          </Form>
          <div className="flex justify-between text-sm">
            {link("reset", "¿Olvidaste tu contraseña?")}
            {link("signup", "Crear cuenta")}
          </div>
        </>
      )}
      {mode === "signup" && (
        <>
          <Form action={signUpAction} key="signup">
            {(email) => (
              <>
                <Email value={email} />
                <Password autoComplete="new-password" label="Contraseña (mínimo 8 caracteres)" />
                <Password name="password2" autoComplete="new-password" label="Repite la contraseña" />
                <Submit>Crear cuenta</Submit>
              </>
            )}
          </Form>
          <p className="text-center text-sm text-slate-500">¿Ya tienes cuenta? {link("login", "Inicia sesión")}</p>
        </>
      )}
      {mode === "reset" && (
        <>
          <Form action={resetAction} key="reset">
            {(email) => (
              <>
                <p className="text-sm text-slate-600">Te enviaremos un enlace para crear una nueva contraseña.</p>
                <Email value={email} />
                <Submit>Enviar enlace</Submit>
              </>
            )}
          </Form>
          <p className="text-center text-sm">{link("login", "← Volver a iniciar sesión")}</p>
        </>
      )}
      {devLogin && (
        <div className="border-t border-slate-200 pt-4">
          <Form action={devSignInAction} key="dev">
            {() => (
              <>
                <label className="label" htmlFor="dev-email">Acceso de desarrollo (sin contraseña)</label>
                <input id="dev-email" name="email" type="email" required className="input" placeholder="admin@jero.dev" />
                <Submit>Entrar (dev)</Submit>
              </>
            )}
          </Form>
        </div>
      )}
    </div>
  );
}
