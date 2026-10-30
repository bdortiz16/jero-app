"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fila que abre el panel del movimiento al hacer clic (sin interferir con botones y enlaces). */
export function ClickableRow({ href, selected, children }: { href: string; selected?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role=dialog]")) return;
        router.push(href, { scroll: false });
      }}
      className={`cursor-pointer transition-colors hover:bg-brand-50/60 ${selected ? "bg-brand-50" : ""}`}
    >
      {children}
    </tr>
  );
}

/** Panel lateral que se despliega sobre la lista. */
export function SidePanel({ closeHref, title, children }: { closeHref: string; title: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(closeHref, { scroll: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Cerrar" className="absolute inset-0 bg-slate-900/40" />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm font-medium text-slate-500">{title}</span>
          <Link href={closeHref} scroll={false} className="grid h-8 w-8 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</Link>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
}
