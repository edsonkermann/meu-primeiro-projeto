import { MAP_HEIGHT, MAP_WIDTH } from "./constants";
import { clamp, lerp } from "./math";
import { hash2 } from "./rng";

/**
 * Tipos de tile do mapa. Usamos um objeto "as const" em vez de enum para que
 * o mesmo código funcione igual no Node e no navegador.
 */
export const Tile = {
  Grass: 0,
  DarkGrass: 1,
  Flowers: 2,
  Dirt: 3,
  Sand: 4,
  Water: 5,
  DeepWater: 6,
  Tree: 7,
  Rock: 8,
  Stone: 9,
  House: 10,
  Fountain: 11,
  Bridge: 12,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

const WALKABLE: readonly boolean[] = (() => {
  const table = new Array<boolean>(16).fill(false);
  for (const t of [Tile.Grass, Tile.DarkGrass, Tile.Flowers, Tile.Dirt, Tile.Sand, Tile.Stone, Tile.Bridge]) {
    table[t] = true;
  }
  return table;
})();

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly tiles: Uint8Array;
  /** Centro da vila em coordenadas de mundo e raio da zona segura. */
  readonly town: { x: number; y: number; radius: number };
  /** Onde os jogadores nascem e renascem. */
  readonly spawn: { x: number; y: number };
  readonly houses: readonly Rect[];
  readonly fountain: Rect;
}

export type Zone = 0 | 1 | 2 | 3;

export const ZONE_NAMES: Record<Zone, string> = {
  0: "Vila de Arden",
  1: "Campos de Lírio",
  2: "Bosque dos Lobos",
  3: "Ruínas Esquecidas",
};

export const ZONE_HINTS: Record<Zone, string> = {
  0: "Zona segura",
  1: "Nível 1 a 3",
  2: "Nível 4 a 8",
  3: "Nível 9 ou mais",
};

const WATER_LEVEL = 0.32;
const TOWN_RADIUS = 7;

/**
 * Gera o mapa inteiro a partir de uma seed. Servidor e cliente chamam esta
 * mesma função, então o mapa nunca precisa trafegar pela rede: basta a seed.
 */
export function generateMap(seed: number, width = MAP_WIDTH, height = MAP_HEIGHT): GameMap {
  const tiles = new Uint8Array(width * height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const index = (x: number, y: number) => y * width + x;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const isBorder = (x: number, y: number) => x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
  const distToTown = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);

  // 1) Terreno base: "elevação" define água, areia e grama; "umidade" define as florestas.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = distToTown(x, y);
      let elevation = fbm(x, y, seed);
      const moisture = fbm(x + 512, y + 512, seed ^ 0x5bd1e995);
      if (d < 18) elevation += (1 - d / 18) * 0.35; // terreno firme ao redor da vila

      let tile: Tile;
      if (elevation < WATER_LEVEL) tile = elevation < WATER_LEVEL - 0.06 ? Tile.DeepWater : Tile.Water;
      else if (elevation < WATER_LEVEL + 0.03) tile = Tile.Sand;
      else if (moisture > 0.6) tile = Tile.DarkGrass;
      else tile = Tile.Grass;

      if ((tile === Tile.Grass || tile === Tile.DarkGrass) && d > TOWN_RADIUS + 4) {
        const roll = hash2(x, y, seed + 7);
        const wildness = clamp((d - TOWN_RADIUS) / 40, 0, 1); // mais mato longe da vila
        const forest = clamp((moisture - 0.5) * 4, 0, 1); // florestas em manchas, não espalhadas
        if (roll < 0.015 + forest * (0.3 + 0.45 * wildness)) tile = Tile.Tree;
        else if (roll > 1 - (0.004 + 0.02 * wildness)) tile = Tile.Rock;
        else if (tile === Tile.Grass && hash2(x, y, seed + 13) < 0.05) tile = Tile.Flowers;
      }
      tiles[index(x, y)] = tile;
    }
  }

  // 2) Borda do mundo: duas camadas de árvores e rochas.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBorder(x, y)) tiles[index(x, y)] = hash2(x, y, seed + 3) < 0.65 ? Tile.Tree : Tile.Rock;
    }
  }

  // 3) Estradas: saem da vila nas quatro direções, com curvas suaves. Sobre a água viram pontes.
  const paintRoad = (x: number, y: number) => {
    if (!inBounds(x, y) || isBorder(x, y)) return;
    const i = index(x, y);
    const current = tiles[i];
    tiles[i] = current === Tile.Water || current === Tile.DeepWater || current === Tile.Bridge ? Tile.Bridge : Tile.Dirt;
  };
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  directions.forEach(([dx, dy], k) => {
    const length = dx !== 0 ? width / 2 : height / 2;
    for (let s = 0; s <= length; s++) {
      const wobble = Math.round((valueNoise(s, k * 97 + 13, seed + 99, 10) - 0.5) * 9 * Math.min(1, s / 14));
      const rx = cx + dx * s + (dy !== 0 ? wobble : 0);
      const ry = cy + dy * s + (dx !== 0 ? wobble : 0);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) paintRoad(rx + ox, ry + oy);
      }
    }
  });

  // 4) Vila: piso de pedra, um anel limpo ao redor, fonte no centro e casas.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = distToTown(x, y);
      const i = index(x, y);
      if (d <= TOWN_RADIUS + 0.5) tiles[i] = Tile.Stone;
      else if (d <= TOWN_RADIUS + 3.5 && tiles[i] !== Tile.Dirt && tiles[i] !== Tile.Bridge) tiles[i] = Tile.Grass;
    }
  }
  const fountain: Rect = { x: cx - 1, y: cy - 1, w: 2, h: 2 };
  const houses: Rect[] = [
    { x: cx - 6, y: cy - 5, w: 3, h: 2 },
    { x: cx + 3, y: cy - 5, w: 3, h: 2 },
    { x: cx - 6, y: cy + 3, w: 3, h: 2 },
    { x: cx + 3, y: cy + 3, w: 3, h: 2 },
  ];
  const fillRect = (r: Rect, tile: Tile) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) tiles[index(x, y)] = tile;
    }
  };
  fillRect(fountain, Tile.Fountain);
  for (const house of houses) fillRect(house, Tile.House);

  // 5) Conectividade: todo tile caminhável precisa ser alcançável a partir da vila.
  //    Bolsões isolados viram floresta, para que nenhum monstro nasça onde não dá para chegar.
  const spawnTx = cx;
  const spawnTy = cy + 2;
  const reached = new Uint8Array(width * height);
  const queue: number[] = [index(spawnTx, spawnTy)];
  reached[index(spawnTx, spawnTy)] = 1;
  while (queue.length > 0) {
    const i = queue.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = index(nx, ny);
      if (reached[ni] === 1 || !isWalkableTile(tiles[ni] as number)) continue;
      reached[ni] = 1;
      queue.push(ni);
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (reached[i] === 0 && isWalkableTile(tiles[i] as number)) tiles[i] = Tile.Tree;
  }

  return {
    width,
    height,
    seed,
    tiles,
    town: { x: cx, y: cy, radius: TOWN_RADIUS },
    spawn: { x: spawnTx + 0.5, y: spawnTy + 0.5 },
    houses,
    fountain,
  };
}

export function isWalkableTile(tile: number): boolean {
  return WALKABLE[tile] === true;
}

/** Tile na posição (tx, ty). Fora do mapa conta como rocha (bloqueado). */
export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return Tile.Rock;
  return map.tiles[ty * map.width + tx] as number;
}

export function isWalkable(map: GameMap, tx: number, ty: number): boolean {
  return isWalkableTile(tileAt(map, tx, ty));
}

/**
 * A zona segura é um conjunto de tiles: dentro da vila nenhum monstro entra e
 * ninguém luta. Definir por tile (e não por distância exata) garante que
 * "estar na vila" signifique o mesmo para jogadores e para o pathfinding dos monstros.
 */
export function isSafeTile(map: GameMap, tx: number, ty: number): boolean {
  return Math.hypot(tx + 0.5 - map.town.x, ty + 0.5 - map.town.y) <= map.town.radius + 0.5;
}

export function isSafeZone(map: GameMap, x: number, y: number): boolean {
  return isSafeTile(map, Math.floor(x), Math.floor(y));
}

/** As zonas são anéis ao redor da vila: quanto mais longe, mais perigoso. */
export function zoneAt(map: GameMap, x: number, y: number): Zone {
  const d = Math.hypot(x - map.town.x, y - map.town.y);
  if (d <= map.town.radius + 0.5) return 0;
  if (d < 21) return 1;
  if (d < 33) return 2;
  return 3;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ruído de valor: interpola valores aleatórios de uma grade com células de tamanho `cell`. */
function valueNoise(x: number, y: number, seed: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = smoothstep(x / cell - gx);
  const fy = smoothstep(y / cell - gy);
  const a = hash2(gx, gy, seed);
  const b = hash2(gx + 1, gy, seed);
  const c = hash2(gx, gy + 1, seed);
  const d = hash2(gx + 1, gy + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/** Soma de oitavas de ruído: formas grandes com detalhes menores por cima. */
function fbm(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, seed, 20) * 0.55 + valueNoise(x, y, seed + 101, 10) * 0.3 + valueNoise(x, y, seed + 211, 5) * 0.15
  );
}
