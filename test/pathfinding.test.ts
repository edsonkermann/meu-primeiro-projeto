import { describe, expect, it } from "vitest";
import { findPath, lineWalkable, smoothPath, type WalkFn } from "../src/game/pathfinding";

/** Monta uma grade a partir de um desenho: "#" é parede, "." é chão. */
function grid(rows: string[]): { width: number; height: number; walk: WalkFn } {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const walk: WalkFn = (x, y) => x >= 0 && y >= 0 && x < width && y < height && (rows[y] as string)[x] === ".";
  return { width, height, walk };
}

describe("pathfinding A*", () => {
  it("encontra o caminho reto em campo aberto", () => {
    const { width, height, walk } = grid([".....", ".....", "....."]);
    const path = findPath(width, height, walk, 0, 1, 4, 1);
    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);
  });

  it("contorna paredes", () => {
    const { width, height, walk } = grid([".....", ".###.", "....."]);
    const path = findPath(width, height, walk, 0, 1, 4, 1);
    expect(path).not.toBeNull();
    for (const step of path ?? []) expect(walk(step.x, step.y)).toBe(true);
    expect(path?.at(-1)).toEqual({ x: 4, y: 1 });
  });

  it("não corta quinas na diagonal entre dois obstáculos", () => {
    const { width, height, walk } = grid(["..#", ".#.", "..."]);
    // De (0,0) até (2,1): a diagonal (1,0)->(2,1) passaria entre duas paredes.
    const path = findPath(width, height, walk, 0, 0, 2, 1) ?? [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as { x: number; y: number };
      const b = path[i] as { x: number; y: number };
      if (a.x !== b.x && a.y !== b.y) {
        expect(walk(b.x, a.y) && walk(a.x, b.y)).toBe(true);
      }
    }
  });

  it("retorna null quando o destino é inalcançável", () => {
    const { width, height, walk } = grid(["..#..", "..#..", "..#.."]);
    expect(findPath(width, height, walk, 0, 0, 4, 0)).toBeNull();
  });

  it("desiste ao passar do limite de nós explorados", () => {
    const rows = Array.from({ length: 60 }, () => ".".repeat(60));
    const { width, height, walk } = grid(rows);
    expect(findPath(width, height, walk, 0, 0, 59, 59, 20)).toBeNull();
    expect(findPath(width, height, walk, 0, 0, 59, 59, 10_000)).not.toBeNull();
  });

  it("suaviza o caminho em linha reta quando não há obstáculos", () => {
    const { walk } = grid(Array.from({ length: 10 }, () => ".".repeat(10)));
    const points = [1, 2, 3, 4, 5].map((i) => ({ x: i + 0.5, y: i + 0.5 }));
    expect(smoothPath(walk, 0.5, 0.5, points)).toEqual([{ x: 5.5, y: 5.5 }]);
  });

  it("detecta obstáculos na linha de visão considerando a largura do corpo", () => {
    const { walk } = grid(["...", ".#.", "..."]);
    expect(lineWalkable(walk, 0.5, 0.5, 2.5, 2.5)).toBe(false);
    expect(lineWalkable(walk, 0.5, 0.5, 2.5, 0.5)).toBe(true);
  });
});
