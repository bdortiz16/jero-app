import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";

// Renueva la sesión de Supabase en cada petición para que no expire mientras se usa la app.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const cfg = supabaseConfig();
  if (!cfg) return response;
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*", "/pendiente", "/login", "/cuenta/:path*"],
};
