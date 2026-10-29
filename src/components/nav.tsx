"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function Nav({ sections }: { sections: { title?: string; items: Item[] }[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-6">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <div className="mb-2 px-3 text-xs font-semibold tracking-wide text-brand-100/60 uppercase">{s.title}</div>}
          <ul className="space-y-1">
            {s.items.map((it) => {
              const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-medium text-white" : "text-brand-100 hover:bg-white/10"}`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
