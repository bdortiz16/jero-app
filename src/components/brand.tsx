// Identidad de Jero Contable (logo B4: barras de crecimiento + J en Montserrat).
// Los trazos son la tipografía Montserrat convertida a vectores: se ven igual en cualquier dispositivo.

const J_PATH =
  "M42.50 51Q39.54 51 37.06 49.90Q34.58 48.79 33 46.75L36.75 42.25Q37.96 43.83 39.29 44.65Q40.63 45.46 42.17 45.46Q46.29 45.46 46.29 40.63L46.29 26.75L36.04 26.75L36.04 21.33L53 21.33L53 40.25Q53 45.67 50.33 48.33Q47.67 51 42.50 51";
const WORD_PATH =
  "M1.79 63.31Q-0.22 63.31-2.07 62.89Q-3.92 62.47-5.21 61.63L-2.86 55.30Q-1.34 56.37 0.84 56.37Q2.46 56.37 3.44 55.28Q4.42 54.18 4.42 52L4.42 21.87L13.16 21.87L13.16 51.94Q13.16 57.15 10.19 60.23Q7.22 63.31 1.79 63.31M8.79 17.67Q6.38 17.67 4.87 16.27Q3.36 14.87 3.36 12.80Q3.36 10.73 4.87 9.33Q6.38 7.93 8.79 7.93Q11.20 7.93 12.71 9.24Q14.22 10.56 14.22 12.63Q14.22 14.82 12.74 16.24Q11.26 17.67 8.79 17.67M36.18 52.45Q31.02 52.45 27.13 50.43Q23.24 48.42 21.11 44.92Q18.98 41.42 18.98 36.94Q18.98 32.40 21.08 28.90Q23.18 25.40 26.82 23.41Q30.46 21.42 35.06 21.42Q39.48 21.42 43.04 23.30Q46.59 25.18 48.66 28.68Q50.74 32.18 50.74 37.05Q50.74 37.55 50.68 38.20Q50.62 38.84 50.57 39.40L27.78 39.40Q28.06 40.58 28.67 41.58Q29.74 43.49 31.72 44.47Q33.71 45.45 36.40 45.45Q38.81 45.45 40.63 44.72Q42.45 43.99 43.96 42.54L48.61 47.58Q46.54 49.93 43.40 51.19Q40.26 52.45 36.18 52.45M27.66 34.30L42.50 34.30Q42.28 32.90 41.66 31.73Q40.71 29.99 39.03 29.01Q37.35 28.03 35.11 28.03Q32.87 28.03 31.16 29.01Q29.46 29.99 28.50 31.73Q27.89 32.90 27.66 34.30M65.30 52L56.56 52L56.56 21.87L64.90 21.87L64.90 25.85Q66.14 24.11 68.04 23.05Q71.01 21.42 75.26 21.42L75.26 29.49Q74.70 29.43 74.26 29.40Q73.81 29.38 73.30 29.38Q69.72 29.38 67.51 31.42Q65.30 33.46 65.30 37.78M95.03 52.45Q90.22 52.45 86.49 50.43Q82.77 48.42 80.61 44.92Q78.46 41.42 78.46 36.94Q78.46 32.40 80.61 28.90Q82.77 25.40 86.49 23.41Q90.22 21.42 95.03 21.42Q99.79 21.42 103.54 23.41Q107.30 25.40 109.42 28.87Q111.55 32.34 111.55 36.94Q111.55 41.42 109.42 44.92Q107.30 48.42 103.54 50.43Q99.79 52.45 95.03 52.45M95.03 45.28Q97.22 45.28 98.95 44.27Q100.69 43.26 101.70 41.39Q102.70 39.51 102.70 36.94Q102.70 34.30 101.70 32.46Q100.69 30.61 98.95 29.60Q97.22 28.59 95.03 28.59Q92.85 28.59 91.11 29.60Q89.38 30.61 88.34 32.46Q87.30 34.30 87.30 36.94Q87.30 39.51 88.34 41.39Q89.38 43.26 91.11 44.27Q92.85 45.28 95.03 45.28";

/** Símbolo cuadrado (ícono de la app). */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Jero Contable">
      <rect width="64" height="64" rx="16" fill="#0a3324" />
      <rect x="11" y="37" width="8" height="14" rx="2.5" fill="#5fd3a1" />
      <rect x="22" y="28" width="8" height="23" rx="2.5" fill="#2fb47f" />
      <path d={J_PATH} fill="#fff" />
    </svg>
  );
}

/** Logo completo: símbolo + "jero" (Montserrat) + "CONTABLE". tone="dark" para fondos oscuros. */
export function BrandLogo({ size = 36, tone = "light", className = "" }: { size?: number; tone?: "light" | "dark"; className?: string }) {
  const wordHeight = size * 0.78;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="flex flex-col">
        <svg height={wordHeight} viewBox="-6 7 118 57" aria-label="jero" style={{ width: (wordHeight * 118) / 57 }}>
          <path d={WORD_PATH} fill={tone === "dark" ? "#ffffff" : "#0a3324"} fillRule="evenodd" />
        </svg>
        <span
          className={`font-semibold uppercase leading-none ${tone === "dark" ? "text-emerald-200" : "text-brand-600"}`}
          style={{ fontSize: Math.max(8, size * 0.21), letterSpacing: "0.34em", marginTop: size * 0.06, paddingLeft: size * 0.04 }}
        >
          Contable
        </span>
      </span>
    </span>
  );
}
