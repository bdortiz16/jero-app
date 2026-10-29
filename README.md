# Jero

Sistema contable con **facturación electrónica masiva conectada a Siigo Nube**.

- Página web pública (landing) + inicio de sesión con **Google**.
- Roles: **Administrador** (todo + conexión Siigo + usuarios), **Contador** (emite y sincroniza), **Consulta** (solo lectura).
  Los usuarios nuevos quedan *pendientes* hasta que un admin los apruebe (`REQUIRE_APPROVAL`).
- **Facturación masiva**: sube un `.xlsx`/`.csv` (una fila por ítem), Jero valida y calcula totales, y tras confirmar
  crea las facturas en Siigo (`POST /v1/invoices`), que las envía a la DIAN y al correo del cliente.
- Sincronización de **clientes** y **productos** desde Siigo; catálogos de comprobantes, impuestos, formas de pago, vendedores y centros de costo.
- **Reportes**: ventas por mes, IVA generado, retenciones, principales clientes y libro de ventas exportable (CSV para Excel).
- **Auditoría** de acciones; credenciales de Siigo **cifradas** (AES-256-GCM).

## Stack

Next.js 16 (App Router, Server Actions) · Auth.js v5 (Google) · Drizzle ORM · PostgreSQL (o PGlite embebido en desarrollo) · Tailwind CSS 4 · Vitest.

## Arranque local

```bash
npm install
cp .env.example .env.local   # completa las variables
npm run dev
```

Sin `DATABASE_URL` se usa una base Postgres embebida en `./.data` que se migra sola.
Para probar sin Google ni Siigo: `DEV_LOGIN=true` y `SIIGO_MOCK=true` en `.env.local` (solo en desarrollo).

### Google OAuth

1. Google Cloud Console → *APIs y servicios* → *Credenciales* → *Crear ID de cliente OAuth* (Aplicación web).
2. URI de redirección autorizado: `http://localhost:3000/api/auth/callback/google` y `https://TU-DOMINIO/api/auth/callback/google`.
3. Copia el ID y el secreto a `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`. Genera `AUTH_SECRET` con `npx auth secret`.
4. Pon tu correo en `ADMIN_EMAILS` para ser administrador (el primer usuario que entra también queda como admin).

### Siigo

1. En Siigo Nube: *Configuración → Alianzas → Mi credencial API* (requiere un plan con API).
2. En Jero: **Admin → Conexión Siigo** → usuario API, access key y Partner-Id → *Guardar y probar conexión*.
3. Elige el comprobante de factura de venta, vendedor y forma de pago predeterminados.
4. En **Clientes** y **Productos** pulsa *Sincronizar desde Siigo* (se usan para validar el archivo).

## Archivo de facturación masiva

Descarga la plantilla desde *Facturación masiva*. Columnas (separador `;` o `,`):

| Columna | Obligatoria | Descripción |
|---|---|---|
| `referencia` | sí | Agrupa filas en una factura (`F-001`). No se puede repetir una referencia ya emitida. |
| `fecha` | | `AAAA-MM-DD` o `DD/MM/AAAA`; vacío = hoy |
| `cliente_nit` | sí | Identificación del cliente (se aceptan puntos y DV) |
| `sucursal` | | Sucursal del cliente (0) |
| `producto_codigo` | sí | Código del producto en Siigo |
| `descripcion` | | |
| `cantidad`, `precio` | sí | Precio unitario **antes de impuestos**. `850.000` y `850000` son válidos |
| `descuento` | | Valor del descuento del ítem |
| `impuestos` | | IDs de impuestos Siigo separados por `\|`; vacío = los del producto |
| `forma_pago`, `vendedor`, `centro_costo` | | IDs de Siigo; vacío = predeterminados |
| `vencimiento` | | Para pagos a crédito; vacío = fecha + días de plazo |
| `observaciones` | | |

El valor del pago se calcula como `base + impuestos − retenciones` (ReteIVA sobre el IVA). Si una fila de una
factura tiene error, esa factura completa se rechaza y se muestra el motivo; el resto del lote sigue.

### Envío seguro

- El envío se hace en bloques de 5 facturas desde el navegador (funciona en Vercel/serverless); se puede pausar y reanudar.
- Cada factura se reclama de forma atómica (`FOR UPDATE SKIP LOCKED`) para no enviarla dos veces aunque haya dos pestañas.
- Errores temporales (429/5xx) se reintentan hasta 3 veces; los errores de datos quedan marcados con el mensaje de Siigo.
- Si un envío se interrumpe a mitad, la factura queda en *error – estado incierto* para verificarla en Siigo antes de reintentar.

## Despliegue (Vercel + Neon, dominio en Cloudflare)

1. **Base de datos:** crea un proyecto en [Neon](https://neon.tech) y copia la *connection string* (pooled).
2. **Vercel:** importa el repositorio `jero-app`. Las migraciones corren solas en cada despliegue (`vercel-build`).
   Variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`,
   `REQUIRE_APPROVAL=true`, `ENCRYPTION_KEY` (`openssl rand -base64 32`), `SIIGO_MOCK=false`.
3. **Dominio:** en Vercel → *Settings → Domains* agrega `app.tudominio.com`. En Cloudflare → *DNS* crea
   `CNAME app → cname.vercel-dns.com` con el proxy **desactivado (nube gris, "DNS only")**.
   Para el dominio raíz usa el registro `A @ → 76.76.21.21` (o el valor que muestre Vercel), también en gris.
4. **Google:** en el cliente OAuth agrega el origen `https://app.tudominio.com` y la redirección
   `https://app.tudominio.com/api/auth/callback/google`.
5. Entra con el correo de `ADMIN_EMAILS` y configura Siigo en *Admin → Conexión Siigo*.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run lint` (typecheck) · `npm run db:generate` (tras cambiar `src/db/schema.ts`) · `npm run db:migrate`

## Pendiente de confirmar con la documentación oficial de Siigo

La integración está en `src/lib/siigo/` (contrato en `types.ts`). Verificar contra tu documentación:
- Si el campo `discount` de los ítems es valor o porcentaje para tu tipo de comprobante (`discount_type`).
- Redondeo de impuestos de Siigo vs. el cálculo local del valor del pago.
- Soporte del encabezado `Idempotency-Key` y el endpoint de PDF (`/v1/invoices/{id}/pdf`).
