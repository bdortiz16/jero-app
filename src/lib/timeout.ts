/** Rechaza si la promesa no termina en `ms`; cancela el temporizador al terminar (sin rechazos huérfanos). */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(message)), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}
