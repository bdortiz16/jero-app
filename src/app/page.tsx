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
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <Logo size={32} />
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href="#funciones" className="hidden text-sm text-slate-600 hover:text-slate-900 md:block">Funciones</a>
          <a href="#como" className="hidden text-sm text-slate-600 hover:text-slate-900 md:block">Cómo funciona</a>
          <Link href="/pagos" className="btn-secondary hidden whitespace-nowrap sm:inline-flex">Consulta tus pagos</Link>
          {email ? (
            <Link href="/app" className="btn-primary whitespace-nowrap px-3 text-sm sm:px-4">Ir a la app</Link>
          ) : (
            <Link href="/login" className="btn-primary whitespace-nowrap px-3 text-sm sm:px-4">Iniciar sesión</Link>
          )}
        </nav>
      </header>

      {/* Los clientes ven un solo valor en su factura y no saben a qué pagos corresponde: aquí lo consultan.
          Va arriba de todo porque la mayoría llega desde el celular por un enlace de WhatsApp. */}
      <section className="mx-auto max-w-4xl px-4 pt-2 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-brand-900 sm:text-xl">¿Recibiste pagos de JERO o KAUPALOKI?</h2>
            <p className="mt-1 text-sm text-brand-800 sm:text-base">Mira cada pago (fecha, valor y factura) con tu cédula o NIT.</p>
          </div>
          <Link href="/pagos" className="btn-primary w-full shrink-0 justify-center px-6 py-3 text-base sm:w-auto">
            Consulta tus pagos →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-12 pb-20 text-center sm:px-6 sm:pt-16 sm:pb-24">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">Integrado con Siigo Nube</span>
        <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-bold tracking-tight sm:text-6xl">
          Emite <span className="text-brand-600">cientos de facturas</span> electrónicas en minutos
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 sm:text-lg">
          Jero es el sistema contable que conecta tu operación con Siigo: carga un archivo, revisa y factura masivamente,
          con reportes listos para tu contador.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary justify-center px-6 py-3 text-base">Empezar ahora</Link>
          <a href="#como" className="btn-secondary justify-center px-6 py-3 text-base">Ver cómo funciona</a>
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
