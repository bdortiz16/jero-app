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
        <PaymentLookup />
      </main>
    </div>
  );
}
