import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Las migraciones SQL se leen en tiempo de ejecución (creación automática de tablas en Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
