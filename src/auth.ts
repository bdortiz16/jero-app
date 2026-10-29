import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; status: Status } & DefaultSession["user"];
  }
}

export type Role = "ADMIN" | "CONTADOR" | "USUARIO";
export type Status = "pending" | "active" | "disabled";

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";

const providers: Provider[] = [Google];
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev",
      credentials: { email: { label: "Email" } },
      authorize: async (c) => {
        const email = String(c?.email ?? "").trim().toLowerCase();
        return email ? { id: email, email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

/** Crea o actualiza el usuario local al iniciar sesión y devuelve su registro. */
async function upsertUser(profile: { email: string; name?: string | null; image?: string | null }) {
  const db = await getDb();
  const email = profile.email.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const isAdminEmail = adminEmails().includes(email);

  if (existing) {
    const [u] = await db
      .update(schema.users)
      .set({
        name: profile.name ?? existing.name,
        image: profile.image ?? existing.image,
        lastLoginAt: new Date(),
        ...(isAdminEmail ? { role: "ADMIN", status: "active" } : {}),
      })
      .where(eq(schema.users.id, existing.id))
      .returning();
    return u;
  }

  const anyUser = await db.query.users.findFirst();
  const firstUser = !anyUser;
  const requireApproval = process.env.REQUIRE_APPROVAL !== "false";
  const [u] = await db
    .insert(schema.users)
    .values({
      email,
      name: profile.name,
      image: profile.image,
      role: isAdminEmail || firstUser ? "ADMIN" : "USUARIO",
      status: isAdminEmail || firstUser || !requireApproval ? "active" : "pending",
      lastLoginAt: new Date(),
    })
    .returning();
  return u;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && !(profile?.email_verified ?? false)) return false;
      if (!user.email) return false;
      const u = await upsertUser({ email: user.email, name: user.name, image: user.image });
      return u.status !== "disabled";
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (!email) return token;
      // Rol y estado se leen siempre de la BD para que los cambios del admin apliquen de inmediato.
      const db = await getDb();
      const u = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
      if (!u) return null;
      token.uid = u.id;
      token.role = u.role;
      token.status = u.status;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      session.user.status = token.status as Status;
      return session;
    },
  },
});
