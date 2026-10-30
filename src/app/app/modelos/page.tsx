import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getCatalogs } from "@/lib/siigo";
import { DEFAULT_COMMISSION_CONFIG, previewCommissionInvoice, type CommissionModelConfig } from "@/lib/batch/commission";
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { ClickableRow, SidePanel } from "@/components/row-and-panel";
import { SummaryTable } from "@/components/modal";
import { money } from "@/lib/format";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { deleteModel, saveCommissionModel, syncAllFromSiigo, toggleModel } from "../actions";

export const metadata = { title: "Modelos de negocio" };

export default async function ModelosPage({ searchParams }: { searchParams: Promise<{ editar?: string; nuevo?: string }> }) {
  const user = await requireUser();
  const { editar, nuevo } = await searchParams;
  const db = await getDb();
  const loadProducts = () =>
    db.select({ code: schema.products.code, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.code));
  const [models, products, catalogs] = await Promise.all([
    db.select().from(schema.businessModels).orderBy(asc(schema.businessModels.id)),
    loadProducts(),
    getCatalogs(),
  ]);
  const isAdmin = user.role === "ADMIN";
  const editing = models.find((m) => String(m.id) === editar);
  const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...((editing?.config ?? {}) as Partial<CommissionModelConfig>) };
  const taxes = catalogs?.taxes ?? [];
  const ivas = taxes.filter((t) => /iva/i.test(t.type) && !/rete/i.test(t.type));
  const retentions = taxes.filter((t) => /rete/i.test(t.type));
  const suggestedIva = cfg.ivaTaxId || ivas.find((t) => t.percentage === 19)?.id || 0;
  const suggestedRet =
    cfg.retentionTaxId ??
    (retentions.find((t) => /comisi/i.test(t.name) && Number(t.percentage) === 11) ??
      retentions.find((t) => /comisi/i.test(t.name)) ??
      retentions.find((t) => /fuente/i.test(`${t.type} ${t.name}`) && Number(t.percentage) === 11))?.id ??
    null;
  const pays = catalogs?.paymentTypes ?? [];
  const suggestedPay =
    cfg.paymentId ??
    (pays.find((p) => /transfer/i.test(p.name) && /d[eé]bito/i.test(p.name)) ?? pays.find((p) => /transfer/i.test(p.name)))?.id ??
    null;
  const taxName = (id: number | null | undefined) => taxes.find((t) => t.id === id)?.name ?? (id ? `#${id}` : "—");

  return (
    <>
      <PageHeader
        title="Modelos de negocio"
        description="Plantillas que convierten tus archivos en facturas. Solo un modelo puede estar activo: es el que se usa al emitir (individual o masivo)."
        actions={isAdmin && <Link href="/app/modelos?nuevo=1" scroll={false} className="btn-primary">+ Nuevo modelo</Link>}
      />
      {models.length > 0 && !models.some((m) => m.active) && (
        <div className="mb-4"><Alert kind="warning">No hay ningún modelo activo: activa uno para poder emitir facturas de movimientos.</Alert></div>
      )}

      <div className="card mb-6 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Modelo</th><th>Ítems</th><th>Comisión</th><th>Impuestos de la comisión</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {models.map((m) => {
              const c = { ...DEFAULT_COMMISSION_CONFIG, ...(m.config as Partial<CommissionModelConfig>) };
              return (
                <ClickableRow key={m.id} href={`/app/modelos?editar=${m.id}`} selected={editing?.id === m.id}>
                  <td className="font-medium text-brand-700">{m.name}<div className="text-xs text-slate-500">Pagos a terceros + comisión</div></td>
                  <td className="text-xs">{c.thirdPartyCode} · {c.thirdPartyDescription}<br />{c.commissionCode} · {c.commissionDescription}</td>
                  <td>{c.defaultPct}% {c.ivaIncluded ? "(IVA incluido)" : "+ IVA"}</td>
                  <td className="text-xs">{taxName(c.ivaTaxId)}{c.retentionTaxId ? <><br />{taxName(c.retentionTaxId)} (solo persona jurídica)</> : null}</td>
                  <td>
                    {m.active ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Activo · se usa al emitir</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Inactivo</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <Link className="btn-secondary mr-2 py-1" href={`/app/modelos?editar=${m.id}`} scroll={false}>Ver / editar</Link>
                        {m.active ? (
                          <ActionButton className="btn-secondary py-1" action={toggleModel.bind(null, m.id, false)} confirmTitle="Desactivar modelo" confirmLabel="Desactivar" confirm="Sin un modelo activo no se podrán emitir facturas de movimientos.">
                            Desactivar
                          </ActionButton>
                        ) : (
                          <>
                            <ActionButton className="btn-primary py-1" action={toggleModel.bind(null, m.id, true)} confirmTitle="Activar modelo" confirmLabel="Activar" confirm={`"${m.name}" pasará a ser el modelo con el que se emiten las facturas. Los demás modelos quedarán inactivos.`}>
                              Activar
                            </ActionButton>{" "}
                            <ActionButton className="btn-secondary py-1 text-red-700" action={deleteModel.bind(null, m.id)} confirmTitle="Eliminar modelo" confirmLabel="Eliminar" confirm={`¿Eliminar el modelo "${m.name}"? Esta acción no se puede deshacer.`}>
                              Eliminar
                            </ActionButton>
                          </>
                        )}
                      </>
                    )}
                  </td>
                </ClickableRow>
              );
            })}
            {models.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Aún no hay modelos. Crea el primero con “+ Nuevo modelo”.</td></tr>}
          </tbody>
        </table>
      </div>

      {(editing || (nuevo && isAdmin) || (isAdmin && models.length === 0)) && (
        <SidePanel closeHref="/app/modelos" title={editing ? "Modelo de negocio" : "Nuevo modelo"}>
          {editing && (
            <ModelSummary
              name={editing.name}
              active={editing.active}
              cfg={cfg}
              taxName={taxName}
              ivaPct={taxes.find((t) => t.id === cfg.ivaTaxId)?.percentage ?? 19}
              retPct={taxes.find((t) => t.id === cfg.retentionTaxId)?.percentage ?? null}
              paymentName={(catalogs?.paymentTypes ?? []).find((p) => p.id === cfg.paymentId)?.name ?? "El predeterminado"}
            />
          )}
        {isAdmin && (
        <div className="card">
          <h2 className="mb-1 font-semibold">{editing ? `Editar: ${editing.name}` : "Nuevo modelo: pagos a terceros + comisión"}</h2>
          <p className="mb-4 text-sm text-slate-500">
            Cada operación del archivo genera una factura con dos ítems: el valor dispersado como <b>ingreso de terceros</b> (sin impuestos)
            y la <b>comisión</b> con IVA; la retención en la fuente solo se aplica a personas jurídicas colombianas (NIT).
          </p>
          {!catalogs && <div className="mb-4"><Alert kind="warning">Primero conecta Siigo para cargar impuestos y formas de pago.</Alert></div>}
          {catalogs && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">
                {products.length ? `${products.length} productos` : "Sin productos"} · {catalogs.paymentTypes.length} medios de pago ·{" "}
                {catalogs.taxes.length} impuestos
                <span className="block text-xs text-slate-400">Actualizado de Siigo: {new Date(catalogs.fetchedAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <ActionButton action={syncAllFromSiigo}>Actualizar desde Siigo</ActionButton>
            </div>
          )}
          <ActionForm action={saveCommissionModel} className="grid gap-4 sm:grid-cols-2">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Nombre del modelo</label>
              <input id="name" name="name" required className="input" defaultValue={editing?.name ?? "Dispersión de pagos + comisión"} />
            </div>
            <div>
              <label className="label" htmlFor="thirdPartyCode">Producto de terceros (ítem sin impuestos)</label>
              <ProductField id="thirdPartyCode" products={products} value={cfg.thirdPartyCode} />
            </div>
            <div>
              <label className="label" htmlFor="thirdPartyDescription">Descripción</label>
              <input id="thirdPartyDescription" name="thirdPartyDescription" className="input" defaultValue={cfg.thirdPartyDescription} />
            </div>
            <div>
              <label className="label" htmlFor="commissionCode">Producto de comisión (ítem con IVA)</label>
              <ProductField id="commissionCode" products={products} value={cfg.commissionCode} />
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
              <Link href="/app/modelos" scroll={false} className="btn-secondary">Cerrar</Link>
            </div>
          </ActionForm>
        </div>
      )}
        </SidePanel>
      )}
    </>
  );
}

/** Lista de productos de Siigo; si no hay productos sincronizados, campo de texto para escribir el código. */
function ProductField({ id, products, value }: { id: string; products: { code: string; name: string }[]; value: string }) {
  if (products.length === 0) return <input id={id} name={id} required className="input" defaultValue={value} />;
  const known = products.some((p) => p.code === value);
  return (
    <select id={id} name={id} required className="input" defaultValue={known ? value : ""}>
      <option value="">— Seleccione —</option>
      {products.map((p) => (
        <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
      ))}
    </select>
  );
}

/** Resumen del modelo: cómo arma la factura, con un ejemplo de $1.000.000 a una empresa. */
function ModelSummary({
  name,
  active,
  cfg,
  taxName,
  ivaPct,
  retPct,
  paymentName,
}: {
  name: string;
  active: boolean;
  cfg: CommissionModelConfig;
  taxName: (id: number | null | undefined) => string;
  ivaPct: number;
  retPct: number | null;
  paymentName: string;
}) {
  const ex = previewCommissionInvoice(1_000_000, cfg, ivaPct, retPct);
  return (
    <div className="card mb-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="text-sm text-slate-500">Pagos a terceros + comisión</p>
        </div>
        {active ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Activo · se usa al emitir</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Inactivo</span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-slate-500">Ítem de terceros</dt><dd>{cfg.thirdPartyCode} · sin impuestos</dd>
        <dt className="text-slate-500">Ítem de comisión</dt><dd>{cfg.commissionCode} · {cfg.commissionDescription}</dd>
        <dt className="text-slate-500">Comisión</dt><dd>{cfg.defaultPct}% del valor dispersado {cfg.ivaIncluded ? "(IVA incluido)" : "+ IVA aparte"}{cfg.roundToPeso ? " · redondeada a pesos" : ""}</dd>
        <dt className="text-slate-500">IVA</dt><dd>{taxName(cfg.ivaTaxId)}</dd>
        <dt className="text-slate-500">Retención</dt><dd>{cfg.retentionTaxId ? `${taxName(cfg.retentionTaxId)} · solo empresas (NIT), sobre la comisión sin IVA` : "Sin retención"}</dd>
        <dt className="text-slate-500">Medio de pago</dt><dd>{paymentName}</dd>
      </dl>
      <div>
        <div className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Ejemplo: $1.000.000 dispersados a una empresa</div>
        <SummaryTable
          rows={[
            ["Operación recibida para terceros (02)", money(1_000_000)],
            [`Comisión ${cfg.defaultPct}% (01) · base sin IVA`, money(ex.base)],
            [`IVA ${ivaPct}%`, money(ex.iva)],
            ...(ex.retention ? ([[`Retención ${retPct}% sobre ${money(ex.base)}`, `− ${money(ex.retention)}`]] as [string, string][]) : []),
          ]}
          total={["Total a pagar", money(ex.total)]}
        />
      </div>
    </div>
  );
}
