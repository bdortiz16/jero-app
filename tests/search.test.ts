import { describe, expect, it } from "vitest";
import { searchTokens } from "@/lib/search";

describe("búsqueda de nombres", () => {
  it("ignora tildes, puntos, & y el tipo de sociedad", () => {
    expect(searchTokens("Ingeniería Maquinaria Equipos & Construcciones.")).toEqual(["ingenieria", "maquinaria", "equipos", "construcciones"]);
    expect(searchTokens("Wjoc S.A.S.")).toEqual(["wjoc"]);
    expect(searchTokens("Trading C&C S.A.S.")).toEqual(["trading", "cc"]);
    expect(searchTokens("LC Proyectos y Construcciones S.A.S.")).toEqual(["lc", "proyectos", "construcciones"]);
  });
});
