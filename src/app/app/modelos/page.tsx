import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getCatalogs } from "@/lib/siigo";
import { DEFAULT_COMMISSION_CONFIG, type CommissionModelConfig } from "@/lib/batch/commission";
import { Alert, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { saveCommissionModel, toggleModel } from "../actions";

export const metadata = { title: "Modelos de negocio" };

export default async function ModelosPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const user = await requireUser();
  const { editar } = await searchParams;
  const db = await getDb();
  const [models, products, catalogs] = await Promise.all([
    db.select().from(schema.businessModels).orderBy(asc(schema.businessModels.id)),
    db.select({ code: schema.products.code, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.code)),
    getCatalogs(),
  ]);
  const isAdmin = user.role === "ADMIN";
  const editing = models.find((m) => String(m.id) === editar);
  const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...((editing?.config ?? {}) as Partial<CommissionModelConfig>) };
  const taxes = catalogs?.taxes ?? [];
  const ivas = taxes.filter((t) => /iva/i.test(t.type) && !/rete/i.test(t.type));
  const retentions = taxes.filter((t) => /rete/i.test(t.type));
  const suggestedIva = cfg.ivaTaxId || ivas.find((t) => t.percentage === 19)?.id || 0;
  const suggestedRet = cfg.retentionTaxId ?? retentions.find((t) => /comisi/i.test(t.name) && t.percentage === 11)?.id ?? null;
  const suggestedPay = cfg.paymentId ?? catalogs?.paymentTypes.find((p) => /transferencia/i.test(p.name) && /d[eé]bito/i.test(p.name))?.id ?? null;
  const taxName = (id: number | null | undefined) => taxes.find((t) => t.id === id)?.name ?? (id ? `#${id}` : "—");

  return (
    <>
      <PageHeader title="Modelos de negocio" description="Plantillas que convierten tus archivos en facturas con la estructura de cada negocio." />

      <div className="card mb-6 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Modelo</th><th>Ítems</th><th>Comisión</th><th>Impuestos de la comisión</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {models.map((m) => {
              const c = { ...DEFAULT_COMMISSION_CONFIG, ...(m.config as Partial<CommissionModelConfig>) };
              return (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}<div className="text-xs text-slate-500">Pagos a terceros + comisión</div></td>
                  <td className="text-xs">{c.thirdPartyCode} · {c.thirdPartyDescription}<br />{c.commissionCode} · {c.commissionDescription}</td>
                  <td>{c.defaultPct}% {c.ivaIncluded ? "(IVA incluido)" : "+ IVA"}</td>
                  <td className="text-xs">{taxName(c.ivaTaxId)}{c.retentionTaxId ? <><br />{taxName(c.retentionTaxId)} (solo persona jurídica)</> : null}</td>
                  <td><StatusBadge status={m.active ? "active" : "disabled"} /></td>
                  <td className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <a className="btn-secondary mr-2 py-1" href={`/app/modelos?editar=${m.id}`}>Editar</a>
                        <ActionButton className="btn-secondary py-1" action={toggleModel.bind(null, m.id, !m.active)}>
                          {m.active ? "Desactivar" : "Activar"}
                        </ActionButton>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {models.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Aún no hay modelos. Crea el primero abajo.</td></tr>}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="card max-w-3xl">
          <h2 className="mb-1 font-semibold">{editing ? `Editar: ${editing.name}` : "Nuevo modelo: pagos a terceros + comisión"}</h2>
          <p className="mb-4 text-sm text-slate-500">
            Cada operación del archivo genera una factura con dos ítems: el valor dispersado como <b>ingreso de terceros</b> (sin impuestos)
            y la <b>comisión</b> con IVA; la retención en la fuente solo se aplica a personas jurídicas colombianas (NIT).
          </p>
          {!catalogs && <div className="mb-4"><Alert kind="warning">Primero conecta Siigo para cargar impuestos y formas de pago.</Alert></div>}
          {products.length === 0 && <div className="mb-4"><Alert kind="info">Sincroniza los productos (menú Productos) para elegir los códigos de la lista.</Alert></div>}
          <ActionForm action={saveCommissionModel} className="grid gap-4 sm:grid-cols-2">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Nombre del modelo</label>
              <input id="name" name="name" required className="input" defaultValue={editing?.name ?? "Dispersión de pagos + comisión"} />
            </div>
            <datalist id="productos">{products.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</datalist>
            <div>
              <label className="label" htmlFor="thirdPartyCode">Código producto de terceros</label>
              <input id="thirdPartyCode" name="thirdPartyCode" list="productos" required className="input" defaultValue={cfg.thirdPartyCode} />
            </div>
            <div>
              <label className="label" htmlFor="thirdPartyDescription">Descripción</label>
              <input id="thirdPartyDescription" name="thirdPartyDescription" className="input" defaultValue={cfg.thirdPartyDescription} />
            </div>
            <div>
              <label className="label" htmlFor="commissionCode">Código producto de comisión</label>
              <input id="commissionCode" name="commissionCode" list="productos" required className="input" defaultValue={cfg.commissionCode} />
            </div>
            <div>
              <label className="label" htmlFor="commissionDescription">Descripción</label>
              <input id="commissionDescription" name="commissionDescription" className="input" defaultValue={cfg.commissionDescription} />
            </div>
            <div>
              <label className="label" htmlFor="defaultPct">% de comisión por defecto</label>
              <input id="defaultPct" name="defaultPct" type="number" step="0.0001" min="0" max="100" required className="input" defaultValue={cfg.defaultPct} />
            </div>
            <div>
              <label className="label" htmlFor="ivaTaxId">IVA de la comisión</label>
              <select id="ivaTaxId" name="ivaTaxId" required className="input" defaultValue={suggestedIva || ""}>
                <option value="">— Seleccione —</option>
                {ivas.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="retentionTaxId">Retención (solo persona jurídica colombiana)</label>
              <select id="retentionTaxId" name="retentionTaxId" className="input" defaultValue={suggestedRet ?? ""}>
                <option value="">Sin retención</option>
                {retentions.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="paymentId">Medio de pago</label>
              <select id="paymentId" name="paymentId" className="input" defaultValue={suggestedPay ?? ""}>
                <option value="">El predeterminado</option>
                {(catalogs?.paymentTypes ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="ivaIncluded" defaultChecked={cfg.ivaIncluded} /> La comisión ya incluye el IVA (desmarcado = el IVA se suma aparte)
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="roundToPeso" defaultChecked={cfg.roundToPeso} /> Redondear la comisión a pesos enteros
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Submit>{editing ? "Guardar cambios" : "Crear modelo"}</Submit>
              {editing && <a href="/app/modelos" className="btn-secondary">Cancelar</a>}
            </div>
          </ActionForm>
        </div>
      )}
    </>
  );
}
