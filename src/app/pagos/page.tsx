import Link from "next/link";
import { Logo } from "@/components/ui";
import { PaymentLookup } from "./payment-lookup";

export const metadata = { title: "Consulta tus pagos" };

export default function PagosPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Logo size={32} /></Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">← Volver al inicio</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Consulta tus pagos</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Escribe tu cédula o NIT y verás, uno por uno, los pagos que te hicimos: fecha, valor, banco y la factura en la que
          quedaron incluidos.
        </p>
        {/* En el extracto del banco el pago no dice JERO sino el nombre de la procesadora: sin este aviso
            los clientes no reconocen sus pagos. */}
        <div className="mt-6 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span aria-hidden className="text-lg leading-5">ℹ️</span>
          <p>
            <b>¿Cómo aparecen los pagos en tu banco?</b> Te llegan desde <b>Soluciones y Pagos</b> o <b>RICE</b>, procesadoras de
            pagos aliadas de JERO. Si en tu extracto ves alguno de esos nombres, es un pago nuestro.
          </p>
        </div>
        <PaymentLookup />
      </main>
    </div>
  );
}
