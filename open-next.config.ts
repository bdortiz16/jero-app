import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Todas las páginas son dinámicas (dependen de la sesión), así que no se necesita caché incremental en R2.
export default defineCloudflareConfig({});
