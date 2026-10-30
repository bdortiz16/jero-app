// Identidad de Jero Contable. Para cambiar de logo, cambia BRAND_MARK ("a" | "b" | "c").
export const BRAND_MARK: "a" | "b" | "c" = "a";

export function BrandMark({ size = 32, variant = BRAND_MARK, className = "" }: { size?: number; variant?: "a" | "b" | "c"; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 64 64", className, role: "img", "aria-label": "Jero Contable" } as const;
  if (variant === "b")
    return (
      <svg {...common}>
        <rect width="64" height="64" rx="16" fill="#0a3324" />
        <rect x="14" y="36" width="8" height="14" rx="2.5" fill="#5fd3a1" />
        <rect x="26" y="27" width="8" height="23" rx="2.5" fill="#2fb47f" />
        <path d="M42 14v26c0 6.5-4 10.5-10 10.5" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      </svg>
    );
  if (variant === "c")
    return (
      <svg {...common}>
        <circle cx="32" cy="32" r="32" fill="#17734f" />
        <path d="M40 15v19c0 9-5.5 14.5-13 14.5-5 0-8.6-2.4-10.4-6.4" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M33 23l4 4 9-10" fill="none" stroke="#f5b82e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <defs>
        <linearGradient id="jero-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f8a63" />
          <stop offset="1" stopColor="#0f5a3e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#jero-g)" />
      <path d="M37 26v15.5c0 7-4.2 11-10.5 11-3.6 0-6.4-1.3-8.5-3.6" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="37" cy="14.5" r="5.5" fill="#f5b82e" />
      <circle cx="37" cy="14.5" r="2.2" fill="none" stroke="#c98a0c" strokeWidth="1.4" />
    </svg>
  );
}

/** Logo completo: símbolo + "jero CONTABLE". tone="dark" para fondos oscuros. */
export function BrandLogo({ size = 36, tone = "light", className = "" }: { size?: number; tone?: "light" | "dark"; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={`font-bold tracking-tight ${tone === "dark" ? "text-white" : "text-brand-900"}`} style={{ fontSize: size * 0.72 }}>jero</span>
        <span className={`font-semibold uppercase ${tone === "dark" ? "text-emerald-200" : "text-brand-600"}`} style={{ fontSize: Math.max(8, size * 0.22), letterSpacing: "0.32em", marginTop: size * 0.1 }}>
          Contable
        </span>
      </span>
    </span>
  );
}
