"use client";
import { useTransition } from "react";
import { updateUser } from "../../actions";

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input w-40 py-1"
      defaultValue={role}
      disabled={disabled || pending}
      onChange={(e) => {
        const value = e.target.value;
        start(async () => {
          try {
            await updateUser(userId, { role: value });
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
    >
      <option value="ADMIN">Administrador</option>
      <option value="CONTADOR">Contador</option>
      <option value="USUARIO">Consulta</option>
    </select>
  );
}
