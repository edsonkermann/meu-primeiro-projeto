/** Pequenos utilitários de desenho em Canvas usados por toda a arte procedural. */

export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

const shadeCache = new Map<string, string>();

/** Clareia (amount > 0) ou escurece (amount < 0) uma cor #rrggbb. */
export function shade(hex: string, amount: number): string {
  const key = `${hex}|${amount}`;
  const cached = shadeCache.get(key);
  if (cached) return cached;
  const value = Number.parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  const r = Math.round(((value >> 16) & 255) + (target - ((value >> 16) & 255)) * p);
  const g = Math.round(((value >> 8) & 255) + (target - ((value >> 8) & 255)) * p);
  const b = Math.round((value & 255) + (target - (value & 255)) * p);
  const result = `rgb(${r},${g},${b})`;
  shadeCache.set(key, result);
  return result;
}

/** Mesma cor com transparência. */
export function alpha(hex: string, a: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${a})`;
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

export function fillRoundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}

export function circle(g: Ctx, x: number, y: number, r: number, fill: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

export function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rotation, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

export function line(g: Ctx, x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.lineCap = "round";
  g.stroke();
}

export function outline(g: Ctx, width: number, color = "rgba(20, 14, 10, 0.55)"): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = "round";
  g.stroke();
}

/** Sombra oval no chão, na origem. */
export function groundShadow(g: Ctx, rx: number, strength = 0.28): void {
  ellipse(g, 0, 0, rx, rx * 0.38, `rgba(0,0,0,${strength})`);
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
