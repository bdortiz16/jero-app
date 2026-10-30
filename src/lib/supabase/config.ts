import { pickEnv } from "@/db/url";

// Se leen en tiempo de ejecución (no se incrustan en el build) para servir igual en Vercel y Cloudflare.
// También acepta las variables de la integración Supabase ↔ Vercel aunque tengan prefijo (ej. JERO_SUPABASE_URL).
export function supabaseConfig() {
  const url = pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], ["_SUPABASE_URL"]);
  const key = pickEnv(
    ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ["_SUPABASE_ANON_KEY", "_SUPABASE_PUBLISHABLE_KEY"],
  );
  return url && key ? { url: url.trim().replace(/\/+$/, ""), key: key.trim() } : null;
}
