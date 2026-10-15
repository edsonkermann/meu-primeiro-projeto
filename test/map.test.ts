import { describe, expect, it } from "vitest";
import { generateMap, isSafeZone, isWalkable, isWalkableTile, Tile, tileAt, zoneAt } from "../src/shared/map";

describe("geração do mapa", () => {
  const map = generateMap(20261015);

  it("é determinística: a mesma seed gera exatamente o mesmo mapa", () => {
    const again = generateMap(20261015);
    expect(Buffer.from(again.tiles).equals(Buffer.from(map.tiles))).toBe(true);
  });

  it("seeds diferentes geram mapas diferentes", () => {
    const other = generateMap(42);
    expect(Buffer.from(other.tiles).equals(Buffer.from(map.tiles))).toBe(false);
  });

  it("a vila fica no centro, é zona segura e o ponto de nascimento é caminhável", () => {
    expect(isSafeZone(map, map.spawn.x, map.spawn.y)).toBe(true);
    expect(isWalkable(map, Math.floor(map.spawn.x), Math.floor(map.spawn.y))).toBe(true);
    expect(tileAt(map, map.fountain.x, map.fountain.y)).toBe(Tile.Fountain);
    expect(zoneAt(map, map.town.x, map.town.y)).toBe(0);
  });

  it("todo tile caminhável é alcançável a partir da vila (sem áreas isoladas)", () => {
    const reached = new Set<number>();
    const start = Math.floor(map.spawn.y) * map.width + Math.floor(map.spawn.x);
    const stack = [start];
    reached.add(start);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = (y + dy) * map.width + (x + dx);
        if (!reached.has(ni) && isWalkable(map, x + dx, y + dy)) {
          reached.add(ni);
          stack.push(ni);
        }
      }
    }
    let walkable = 0;
    for (const tile of map.tiles) if (isWalkableTile(tile)) walkable++;
    expect(reached.size).toBe(walkable);
    expect(walkable).toBeGreaterThan(map.width * map.height * 0.4);
  });

  it("a borda do mundo é intransponível", () => {
    for (let x = 0; x < map.width; x++) {
      expect(isWalkable(map, x, 0)).toBe(false);
      expect(isWalkable(map, x, map.height - 1)).toBe(false);
    }
    expect(isWalkable(map, -1, 10)).toBe(false);
  });

  it("as zonas ficam mais perigosas conforme se afastam da vila", () => {
    expect(zoneAt(map, map.town.x + 12, map.town.y)).toBe(1);
    expect(zoneAt(map, map.town.x + 25, map.town.y)).toBe(2);
    expect(zoneAt(map, map.town.x + 40, map.town.y)).toBe(3);
  });
});
