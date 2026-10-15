import type { Point } from "../shared/math";

/** Diz se o tile (tx, ty) pode ser atravessado. */
export type WalkFn = (tx: number, ty: number) => boolean;

export interface TilePoint {
  x: number;
  y: number;
}

const SQRT2 = Math.SQRT2;
const DIRECTIONS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

// Buffers reaproveitados entre buscas (evita alocar memória a cada caminho).
// A "geração" marca quais posições pertencem à busca atual.
let capacity = 0;
let gScore = new Float64Array(0);
let parent = new Int32Array(0);
let seenGen = new Uint32Array(0);
let closedGen = new Uint32Array(0);
let generation = 0;

function ensureCapacity(size: number): void {
  if (capacity >= size) return;
  capacity = size;
  gScore = new Float64Array(size);
  parent = new Int32Array(size);
  seenGen = new Uint32Array(size);
  closedGen = new Uint32Array(size);
  generation = 0;
}

/** Fila de prioridade (heap binário) de índices de tile. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    const items = this.items;
    const prio = this.priorities;
    let i = items.length;
    items.push(item);
    prio.push(priority);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((prio[p] as number) <= priority) break;
      items[i] = items[p] as number;
      prio[i] = prio[p] as number;
      i = p;
    }
    items[i] = item;
    prio[i] = priority;
  }

  pop(): number {
    const items = this.items;
    const prio = this.priorities;
    const top = items[0] as number;
    const lastItem = items.pop() as number;
    const lastPrio = prio.pop() as number;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (prio[r] as number) < (prio[l] as number) ? r : l;
        if ((prio[c] as number) >= lastPrio) break;
        items[i] = items[c] as number;
        prio[i] = prio[c] as number;
        i = c;
      }
      items[i] = lastItem;
      prio[i] = lastPrio;
    }
    return top;
  }
}

/**
 * A* em grade com 8 direções, sem "cortar quinas" de obstáculos.
 * Retorna os tiles do caminho (sem o inicial, com o final) ou `null` se não houver
 * caminho ou se a busca exceder `maxNodes` (proteção contra abuso de CPU).
 */
export function findPath(
  width: number,
  height: number,
  walkable: WalkFn,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = 3000,
): TilePoint[] | null {
  if (sx === gx && sy === gy) return [];
  if (!walkable(gx, gy) || !walkable(sx, sy)) return null;

  ensureCapacity(width * height);
  generation++;
  if (generation === 0xffffffff) {
    seenGen.fill(0);
    closedGen.fill(0);
    generation = 1;
  }
  const gen = generation;
  const start = sy * width + sx;
  const goal = gy * width + gx;
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return (dx + dy + (SQRT2 - 2) * Math.min(dx, dy)) * 1.001;
  };

  const open = new MinHeap();
  seenGen[start] = gen;
  gScore[start] = 0;
  parent[start] = -1;
  open.push(start, heuristic(sx, sy));
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();
    if (closedGen[current] === gen) continue;
    closedGen[current] = gen;

    if (current === goal) {
      const path: TilePoint[] = [];
      let node = goal;
      while (node !== start) {
        path.push({ x: node % width, y: Math.floor(node / width) });
        node = parent[node] as number;
      }
      return path.reverse();
    }

    if (++expanded > maxNodes) return null;

    const cx = current % width;
    const cy = (current - cx) / width;
    const currentG = gScore[current] as number;
    for (const [dx, dy, cost] of DIRECTIONS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const next = ny * width + nx;
      if (closedGen[next] === gen) continue;
      const g = currentG + cost;
      if (seenGen[next] !== gen || g < (gScore[next] as number)) {
        seenGen[next] = gen;
        gScore[next] = g;
        parent[next] = current;
        open.push(next, g + heuristic(nx, ny));
      }
    }
  }
  return null;
}

/** Procura o tile caminhável mais próximo de (tx, ty) num raio pequeno. */
export function nearestWalkable(walkable: WalkFn, tx: number, ty: number, radius: number): TilePoint | null {
  if (walkable(tx, ty)) return { x: tx, y: ty };
  let best: TilePoint | null = null;
  let bestD = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dy * dy;
      if (d < bestD && walkable(tx + dx, ty + dy)) {
        best = { x: tx + dx, y: ty + dy };
        bestD = d;
      }
    }
  }
  return best;
}

const BODY_RADIUS = 0.3;

/**
 * Verifica se dá para andar em linha reta de A até B considerando a "largura"
 * do personagem (amostras ao longo da linha e nas laterais).
 */
export function lineWalkable(walkable: WalkFn, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return walkable(Math.floor(bx), Math.floor(by));
  const steps = Math.ceil(length / 0.2);
  const px = (-dy / length) * BODY_RADIUS;
  const py = (dx / length) * BODY_RADIUS;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (!walkable(Math.floor(x), Math.floor(y))) return false;
    if (!walkable(Math.floor(x + px), Math.floor(y + py))) return false;
    if (!walkable(Math.floor(x - px), Math.floor(y - py))) return false;
  }
  return true;
}

/**
 * Suaviza o caminho do A* ("string pulling"): pula pontos intermediários quando
 * existe linha reta livre. O movimento deixa de parecer um zigue-zague de grade.
 */
export function smoothPath(walkable: WalkFn, fromX: number, fromY: number, points: Point[]): Point[] {
  const result: Point[] = [];
  let ax = fromX;
  let ay = fromY;
  let i = 0;
  while (i < points.length) {
    let j = Math.min(points.length - 1, i + 12);
    while (j > i) {
      const target = points[j] as Point;
      if (lineWalkable(walkable, ax, ay, target.x, target.y)) break;
      j--;
    }
    const chosen = points[j] as Point;
    result.push(chosen);
    ax = chosen.x;
    ay = chosen.y;
    i = j + 1;
  }
  return result;
}
