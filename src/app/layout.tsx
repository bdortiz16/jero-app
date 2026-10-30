import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jero Contable — Facturación electrónica masiva con Siigo", template: "%s · Jero Contable" },
  description: "Emite cientos de facturas electrónicas en Siigo en minutos. Contabilidad simple para tu empresa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
