import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";

// Renueva la sesión de Supabase en cada petición para que no expire mientras se usa la app.
export async function proxy(request: NextRequest) {
  // Si Supabase devuelve el enlace del correo a la raíz (Redirect URL no permitida), lo completamos igual.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && (searchParams.has("code") || searchParams.has("token_hash"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.has("next")) url.searchParams.set("next", "/app");
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const cfg = supabaseConfig();
  if (!cfg) return response;
  // Las precargas de Next no necesitan renovar la sesión (evita viajes extra a Supabase).
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch") return response;
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
  // getClaims valida el token localmente (claves asimétricas) y solo va a la red para renovar la sesión.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/", "/app/:path*", "/api/:path*", "/pendiente", "/login", "/cuenta/:path*"],
};
