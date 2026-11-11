/** Opciones de las solicitudes de nota crédito (las usa también la página pública). */
export const CREDIT_NOTE_REASONS = [
  "El valor de la factura no corresponde a mis pagos",
  "Hay pagos que no reconozco",
  "Mis datos (nombre o documento) están mal",
  "La factura está duplicada",
  "Otro motivo",
] as const;

export const CREDIT_NOTE_STATUS: Record<string, { label: string; style: string }> = {
  pendiente: { label: "Pendiente", style: "bg-amber-100 text-amber-800" },
  en_revision: { label: "En revisión", style: "bg-sky-100 text-sky-800" },
  aprobada: { label: "Nota crédito emitida", style: "bg-emerald-100 text-emerald-800" },
  rechazada: { label: "No procede", style: "bg-slate-200 text-slate-700" },
};

