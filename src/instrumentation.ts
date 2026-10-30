import type { Instrumentation } from "next";

// Registra el mensaje real de los errores del servidor para mostrarlo en /api/diagnostico y en la pantalla de error.
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logServerError } = await import("./lib/error-log");
  await logServerError(err, request.path ?? null);
};
