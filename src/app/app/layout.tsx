import Image from "next/image";
import { signOutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/session";
import { Nav } from "@/components/nav";
import { Logo } from "@/components/ui";
import { siigoMockEnabled } from "@/lib/siigo";

const roleLabel = { ADMIN: "Administrador", CONTADOR: "Contador", USUARIO: "Consulta" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections = [
    {
      items: [
        { href: "/app", label: "Inicio" },
        { href: "/app/masiva", label: "Facturación masiva" },
        { href: "/app/facturas", label: "Facturas" },
        { href: "/app/clientes", label: "Clientes" },
        { href: "/app/productos", label: "Productos" },
        { href: "/app/reportes", label: "Reportes contables" },
      ],
    },
    ...(user.role === "ADMIN"
      ? [
          {
            title: "Administración",
            items: [
              { href: "/app/admin/usuarios", label: "Usuarios" },
              { href: "/app/admin/siigo", label: "Conexión Siigo" },
              { href: "/app/admin/auditoria", label: "Auditoría" },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-brand-900 p-4 text-white">
        <div className="mb-8 px-2">
          <Logo className="text-lg" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav sections={sections} />
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-2">
            {user.image ? (
              <Image src={user.image} alt="" width={32} height={32} className="rounded-full" unoptimized />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-sm">{user.email[0].toUpperCase()}</span>
            )}
            <div className="min-w-0 text-sm">
              <div className="truncate">{user.name ?? user.email}</div>
              <div className="text-xs text-brand-100/70">{roleLabel[user.role]}</div>
            </div>
          </div>
          <form action={signOutAction}>
            <button className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-brand-100 hover:bg-white/10">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {siigoMockEnabled() && (
          <div className="bg-amber-100 px-6 py-2 text-center text-xs text-amber-900">
            Modo simulación: las facturas NO se envían a Siigo real (SIIGO_MOCK=true).
          </div>
        )}
        <div className="mx-auto max-w-7xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
