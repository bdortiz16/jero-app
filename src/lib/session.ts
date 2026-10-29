import "server-only";
import { redirect } from "next/navigation";
import { auth, type Role } from "@/auth";

export async function requireUser(roles?: Role[]) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = session.user;
  if (user.status === "pending") redirect("/pendiente");
  if (user.status !== "active") redirect("/login?error=AccessDenied");
  if (roles && !roles.includes(user.role)) redirect("/app");
  return { id: user.id, email: user.email!, name: user.name, image: user.image, role: user.role };
}

export const requireAdmin = () => requireUser(["ADMIN"]);

/** Admin y contador pueden emitir facturas y cambiar datos contables. */
export const requireEditor = () => requireUser(["ADMIN", "CONTADOR"]);

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;
