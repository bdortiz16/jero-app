import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type Role } from "./auth";

export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "pending") redirect("/pendiente");
  if (user.status !== "active") redirect("/login?error=bloqueado");
  if (roles && !roles.includes(user.role as Role)) redirect("/app");
  return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role as Role };
}

export const requireAdmin = () => requireUser(["ADMIN"]);

/** Admin y contador pueden emitir facturas y cambiar datos contables. */
export const requireEditor = () => requireUser(["ADMIN", "CONTADOR"]);

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;
