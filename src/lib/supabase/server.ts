import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

export async function supabaseServer() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Falta configurar Supabase: SUPABASE_URL y SUPABASE_ANON_KEY.");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy renueva la sesión.
        }
      },
    },
  });
}
