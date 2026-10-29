// Se leen en tiempo de ejecución (no se incrustan en el build) para servir igual en Vercel y Cloudflare.
const read = (name: string) => process.env[name];

export function supabaseConfig() {
  const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    read("SUPABASE_ANON_KEY") ||
    read("SUPABASE_PUBLISHABLE_KEY") ||
    read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return url && key ? { url: url.trim().replace(/\/+$/, ""), key: key.trim() } : null;
}
