import Link from "next/link";
import { getAuthEmail } from "@/lib/auth";
import { Logo } from "@/components/ui";

const features = [
  { title: "Facturación masiva", text: "Sube un Excel o CSV y emite cientos de facturas electrónicas en Siigo con un clic. Validamos cada fila antes de enviar." },
  { title: "Conectado a Siigo", text: "Clientes, productos, impuestos y formas de pago se sincronizan desde tu cuenta de Siigo Nube. La DIAN recibe las facturas desde Siigo." },
  { title: "Control y trazabilidad", text: "Estado de cada factura (emitida, con error, pendiente), reintentos seguros y bitácora de quién hizo qué." },
  { title: "Reportes contables", text: "Libro de ventas, IVA generado, retenciones y cartera por cliente, exportables a Excel." },
  { title: "Equipo con roles", text: "Cada persona entra con su correo y contraseña. El administrador aprueba usuarios y define quién puede emitir." },
  { title: "Seguro", text: "Credenciales de Siigo cifradas, acceso solo para usuarios aprobados y envíos sin duplicados." },
];

export default async function Home() {
  const email = await getAuthEmail().catch(() => null);
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo size={36} />
        <nav className="flex items-center gap-3">
          <a href="#funciones" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:block">Funciones</a>
          <a href="#como" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:block">Cómo funciona</a>
          {email ? (
            <Link href="/app" className="btn-primary">Ir a la app</Link>
          ) : (
            <Link href="/login" className="btn-primary">Iniciar sesión</Link>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">Integrado con Siigo Nube</span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Emite <span className="text-brand-600">cientos de facturas</span> electrónicas en minutos
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Jero es el sistema contable que conecta tu operación con Siigo: carga un archivo, revisa y factura masivamente,
          con reportes listos para tu contador.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/login" className="btn-primary px-6 py-3 text-base">Empezar ahora</Link>
          <a href="#como" className="btn-secondary px-6 py-3 text-base">Ver cómo funciona</a>
        </div>
      </section>

      <section id="funciones" className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="como" className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Cómo funciona</h2>
        <ol className="mt-10 space-y-6">
          {[
            ["Conecta Siigo", "El administrador ingresa el usuario API, access key y Partner-Id de Siigo."],
            ["Sube tu archivo", "Descarga la plantilla, llénala con tus ventas (una fila por ítem) y súbela."],
            ["Revisa", "Jero valida clientes, productos, impuestos y calcula totales antes de enviar."],
            ["Emite", "Las facturas se crean en Siigo y se envían a la DIAN y al correo del cliente."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 font-semibold text-white">{i + 1}</span>
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-slate-600">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Jero · Siigo es marca de su respectivo titular.
      </footer>
    </div>
  );
}
