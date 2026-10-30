import { requireAdmin } from "@/lib/session";
import { getSetting, getSiigoDefaults } from "@/lib/settings";
import { getCatalogs, resolveDocumentId, siigoMockEnabled } from "@/lib/siigo";
import { dateTime } from "@/lib/format";
import { Alert, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { reloadCatalogs, saveDefaults, saveSiigoConnection } from "../../actions";

export const metadata = { title: "Conexión Siigo" };

export default async function SiigoPage() {
  await requireAdmin();
  const creds = await getSetting<{ username: string; partnerId: string }>("siigo:credentials");
  const defaults = await getSiigoDefaults();
  const catalogs = await getCatalogs();
  // Preselección cuando hay una opción clara (el usuario solo confirma con Guardar valores).
  const suggested = {
    documentId: resolveDocumentId(defaults, catalogs),
    sellerId: defaults.sellerId ?? catalogs?.sellers[0]?.id ?? null,
    paymentId:
      defaults.paymentId ??
      catalogs?.paymentTypes.find((p) => /transfer/i.test(p.name) && /d[eé]bito/i.test(p.name))?.id ??
      (catalogs?.paymentTypes.length === 1 ? catalogs.paymentTypes[0].id : null),
  };
  const unsaved = !!catalogs && (!defaults.documentId || !defaults.sellerId || !defaults.paymentId);

  return (
    <>
      <PageHeader title="Conexión con Siigo" description="Credenciales de la API de Siigo Nube y valores por defecto para las facturas." />
      {siigoMockEnabled() && <div className="mb-6"><Alert kind="warning">SIIGO_MOCK=true: se usa una simulación; las credenciales no se utilizan.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-semibold">1. Credenciales API</h2>
          <p className="mb-4 text-sm text-slate-500">
            En Siigo Nube: <i>Configuración → Alianzas → Mi credencial API</i>. Requiere un plan con acceso a la API.
          </p>
          <ActionForm action={saveSiigoConnection} className="space-y-4">
            <div>
              <label className="label" htmlFor="username">Usuario API (correo)</label>
              <input id="username" name="username" type="email" required className="input" defaultValue={creds?.username} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="accessKey">Access key</label>
              <input id="accessKey" name="accessKey" type="password" required className="input" placeholder={creds ? "•••••••• (guardada; escríbela de nuevo para cambiarla)" : ""} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="partnerId">Partner-Id</label>
              <input id="partnerId" name="partnerId" required className="input" defaultValue={creds?.partnerId ?? "jero"} pattern="[A-Za-z0-9]{3,100}" />
              <p className="mt-1 text-xs text-slate-500">Nombre de tu aplicación, alfanumérico, se envía en el encabezado Partner-Id.</p>
            </div>
            <Submit>Guardar y probar conexión</Submit>
          </ActionForm>
        </div>

        <div className="card">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">2. Valores por defecto</h2>
              <p className="text-sm text-slate-500">
                Catálogos {catalogs ? `actualizados ${dateTime(catalogs.fetchedAt)}` : "sin cargar"}.
              </p>
            </div>
            <ActionButton action={reloadCatalogs}>Actualizar catálogos</ActionButton>
          </div>
          {!catalogs ? (
            <Alert>Guarda las credenciales para cargar tipos de comprobante, impuestos, formas de pago y vendedores.</Alert>
          ) : (
            <ActionForm action={saveDefaults} className="space-y-4">
              {unsaved && (
                <Alert kind="warning">Elige los valores marcados y pulsa <b>Guardar valores</b>: sin ellos no se pueden emitir facturas.</Alert>
              )}
              <Select name="documentId" label="Tipo de comprobante (factura de venta)" value={suggested.documentId} options={catalogs.documentTypes.map((d) => [d.id, `${d.code} · ${d.name} (${d.id})`])} required />
              {catalogs.sellers.length ? (
                <Select name="sellerId" label="Vendedor predeterminado" value={suggested.sellerId} options={catalogs.sellers.map((s) => [s.id, `${s.name} (${s.id})`])} required />
              ) : (
                <div>
                  <label className="label" htmlFor="sellerId">Vendedor predeterminado (ID de usuario en Siigo)</label>
                  <input id="sellerId" name="sellerId" type="number" min={1} required className="input" defaultValue={defaults.sellerId ?? ""} placeholder="ej. 211" />
                  <p className="mt-1 text-xs text-slate-500">Siigo no entregó la lista de vendedores. Escribe el ID del usuario vendedor (en Siigo: Configuración → Usuarios).</p>
                </div>
              )}
              <Select name="paymentId" label="Forma de pago predeterminada" value={suggested.paymentId} options={catalogs.paymentTypes.map((p) => [p.id, `${p.name} · ${p.type} (${p.id})`])} required />
              <Select name="costCenterId" label="Centro de costo (opcional)" value={defaults.costCenterId} options={catalogs.costCenters.map((c) => [c.id, `${c.code} · ${c.name}`])} />
              <div>
                <label className="label" htmlFor="dueDays">Días de plazo para pagos a crédito</label>
                <input id="dueDays" name="dueDays" type="number" min={0} className="input max-w-[120px]" defaultValue={defaults.dueDays} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendStamp" defaultChecked={defaults.sendStamp} /> Enviar a la DIAN automáticamente (factura electrónica)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendMail" defaultChecked={defaults.sendMail} /> Enviar la factura por correo al cliente</label>
              <div className="border-t border-slate-200 pt-4">
                <h3 className="mb-1 text-sm font-semibold">Movimientos</h3>
                <p className="mb-3 text-xs text-slate-500">Los clientes que no existan se crean en Siigo con estos datos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="issuerCompanies">Empresas del archivo que se facturan aquí</label>
                    <input id="issuerCompanies" name="issuerCompanies" className="input" defaultValue={defaults.issuerCompanies} placeholder="* = todas" />
                    <p className="mt-1 text-xs text-slate-500">* = todas, o separadas por coma (ej. JERO, KAUPALOKI)</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="newCustomerAddress">Dirección para clientes nuevos</label>
                    <input id="newCustomerAddress" name="newCustomerAddress" className="input" defaultValue={defaults.newCustomerAddress} />
                  </div>
                  <div>
                    <label className="label" htmlFor="newCustomerStateCode">Código departamento (DANE)</label>
                    <input id="newCustomerStateCode" name="newCustomerStateCode" className="input" defaultValue={defaults.newCustomerStateCode} />
                  </div>
                  <div>
                    <label className="label" htmlFor="newCustomerCityCode">Código ciudad (DANE)</label>
                    <input id="newCustomerCityCode" name="newCustomerCityCode" className="input" defaultValue={defaults.newCustomerCityCode} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="newCustomerEmail">Correo de contacto para clientes nuevos (opcional)</label>
                    <input id="newCustomerEmail" name="newCustomerEmail" type="email" className="input" defaultValue={defaults.newCustomerEmail} placeholder="facturacion@tuempresa.com" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="companyNotes">Leyendas por empresa (descripción y observaciones de la factura)</label>
                    <textarea id="companyNotes" name="companyNotes" rows={3} className="input font-mono text-xs" defaultValue={defaults.companyNotes} placeholder="KAUPALOKI: Se elabora bajo un contrato de mandato entre KAUPALOKI y JERO." />
                    <p className="mt-1 text-xs text-slate-500">Una por línea: EMPRESA: texto. Se agrega a las facturas de los movimientos de esa empresa.</p>
                  </div>
                </div>
              </div>
              <Submit>Guardar valores</Submit>
            </ActionForm>
          )}
        </div>
      </div>

      <div className="card mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">3. Modelos de negocio</h2>
          <p className="text-sm text-slate-500">Configura cómo se arman las facturas de cada negocio (ej. pagos a terceros + comisión con IVA y retención).</p>
        </div>
        <a href="/app/modelos" className="btn-primary">Configurar modelos</a>
      </div>

      {catalogs && (
        <div className="card mt-6 overflow-x-auto p-0">
          <h2 className="px-5 py-4 font-semibold">Impuestos disponibles (usa el ID en la columna <code>impuestos</code>)</h2>
          <table className="table">
            <thead><tr><th>ID</th><th>Nombre</th><th>Tipo</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {catalogs.taxes.map((t) => (
                <tr key={t.id}><td className="font-mono text-xs">{t.id}</td><td>{t.name}</td><td>{t.type}</td><td className="text-right">{t.percentage}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Select({ name, label, value, options, required }: { name: string; label: string; value: number | null; options: [number, string][]; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={value ?? ""} required={required}>
        <option value="">{options.length ? `— Seleccione (${options.length} opciones) —` : "— Sin opciones: pulse Actualizar catálogos —"}</option>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </div>
  );
}
