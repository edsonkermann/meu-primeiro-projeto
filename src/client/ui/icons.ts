import type { ItemDef } from "../../shared/data/items";
import { drawItemIcon } from "../render/sprites";

/** Pinta um ícone de item num canvas pequeno do HUD (ocupa ~80% do quadrado). */
export function paintItemCanvas(canvas: HTMLCanvasElement, def: ItemDef | null, fill = 0.8): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!def) return;
  const size = Math.min(canvas.width, canvas.height) * fill;
  g.setTransform(size, 0, 0, size, canvas.width / 2, canvas.height / 2);
  drawItemIcon(g, def.icon, def.rarity);
}

/** Pinta qualquer desenho em unidades de [-0.5, 0.5] centralizado no canvas. */
export function paintCanvas(canvas: HTMLCanvasElement, draw: (g: CanvasRenderingContext2D) => void, fill = 0.8): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const size = Math.min(canvas.width, canvas.height) * fill;
  g.setTransform(size, 0, 0, size, canvas.width / 2, canvas.height / 2);
  draw(g);
}
