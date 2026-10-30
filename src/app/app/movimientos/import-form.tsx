"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseFile } from "@/lib/batch/parse";
import { parseMovementRows } from "@/lib/movements";
import { ProgressPanel, type ProgressState } from "@/components/progress";
import { importMovementsChunk, type MovementDTO } from "../actions";

const CHUNK = 250;

export function ImportMovementsForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ProgressState | null>(null);
  const busy = state?.kind === "working";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      setState({ kind: "working", title: "Leyendo el archivo…", detail: file.name });
      const rows = await parseFile(file.name, await file.arrayBuffer(), { headerKey: "identificacion" });
      const { movements, errors } = parseMovementRows(rows);
      if (!movements.length) {
        setState({ kind: "error", title: "No se encontraron movimientos", detail: errors.slice(0, 3).map((x) => `Fila ${x.row}: ${x.message}`).join(" · ") });
        return;
      }
      const dto: MovementDTO[] = movements.map((m) => ({
        ...m,
        dateFrom: m.dateFrom ? m.dateFrom.toISOString() : null,
        dateTo: m.dateTo ? m.dateTo.toISOString() : null,
      }));
      let importId: number | null = null;
      let inserted = 0;
      for (let i = 0; i < dto.length; i += CHUNK) {
        const done = Math.min(i + CHUNK, dto.length);
        setState({
          kind: "working",
          title: `Subiendo movimientos: ${i.toLocaleString("es-CO")} de ${dto.length.toLocaleString("es-CO")}`,
          detail: `${file.name} · ${movements.length.toLocaleString("es-CO")} movimientos encontrados`,
          percent: (i / dto.length) * 100,
        });
        const res = await importMovementsChunk({ importId, fileName: file.name, total: dto.length, movements: dto.slice(i, done) });
        if (res.error) throw new Error(res.error);
        importId = res.importId ?? importId;
        inserted += res.inserted ?? 0;
      }
      const skipped = dto.length - inserted;
      setState({
        kind: "done",
        percent: 100,
        title: `Listo: ${inserted.toLocaleString("es-CO")} movimientos cargados`,
        detail: [skipped ? `${skipped.toLocaleString("es-CO")} ya existían` : "", errors.length ? `${errors.length} filas con error` : ""].filter(Boolean).join(" · ") || undefined,
      });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setState({ kind: "error", title: "No se pudo cargar el archivo", detail: (err as Error).message });
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <input ref={fileRef} name="file" type="file" accept=".xlsx,.csv" required disabled={busy} className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Cargando…" : "Cargar movimientos"}</button>
      </div>
      {state && <ProgressPanel state={state} />}
    </form>
  );
}
