export interface Point {
  x: number;
  y: number;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Arredonda para 2 casas decimais: posições viajam pela rede com esta precisão. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
