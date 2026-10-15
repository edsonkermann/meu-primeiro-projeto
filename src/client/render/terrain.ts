import { Tile, tileAt, type GameMap, type Rect } from "../../shared/map";
import { hash2 } from "../../shared/rng";
import { circle, ellipse, fillRoundRect, outline, TAU, type Ctx } from "./paint";

/**
 * Desenha o terreno em blocos de 8x8 tiles guardados em cache. Cada bloco é
 * pintado uma única vez (a arte é procedural e determinística pelo hash da
 * posição) e depois só é copiado para a tela.
 */
const CHUNK = 8;
const MAX_CHUNKS = 96;

const GRASS = ["#5a9a47", "#5e9f4b", "#57944a", "#61a34e"];
const FOREST_FLOOR = ["#3f7c39", "#42813b", "#3b7636"];
const DIRT = ["#b18a59", "#ab8453", "#b8915f"];
const SAND = ["#dcc896", "#d8c38e", "#e0cd9c"];
const STONE = ["#c6bfae", "#c1b9a7", "#cbc4b4"];
const FLOWERS = ["#f7dc6f", "#f5b7c5", "#fdfefe", "#c9a2e0"];

function pick(palette: readonly string[], h: number): string {
  return palette[Math.floor(h * palette.length) % palette.length] as string;
}

const isWater = (t: number) => t === Tile.Water || t === Tile.DeepWater;
const isGrassy = (t: number) =>
  t === Tile.Grass || t === Tile.DarkGrass || t === Tile.Flowers || t === Tile.Tree || t === Tile.Rock;

export class TerrainRenderer {
  private readonly cache = new Map<number, HTMLCanvasElement>();
  private tilePx = 0;

  constructor(private readonly map: GameMap) {}

  /** `originX/Y`: posição, em pixels do canvas, do ponto (0, 0) do mundo. Precisam ser inteiros. */
  draw(g: Ctx, originX: number, originY: number, tilePx: number, viewW: number, viewH: number): void {
    if (tilePx !== this.tilePx) {
      this.tilePx = tilePx;
      this.cache.clear();
    }
    const chunkPx = CHUNK * tilePx;
    const cx0 = Math.floor(-originX / chunkPx);
    const cy0 = Math.floor(-originY / chunkPx);
    const cx1 = Math.floor((viewW - originX) / chunkPx);
    const cy1 = Math.floor((viewH - originY) / chunkPx);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        g.drawImage(this.chunk(cx, cy), originX + cx * chunkPx, originY + cy * chunkPx);
      }
    }
  }

  /** Brilho animado da água (desenhado a cada quadro, por cima do cache). Espera transformação de mundo. */
  drawWaterShimmer(g: Ctx, x0: number, y0: number, x1: number, y1: number, time: number): void {
    g.lineCap = "round";
    g.lineWidth = 0.035;
    for (let ty = Math.floor(y0); ty <= Math.ceil(y1); ty++) {
      for (let tx = Math.floor(x0); tx <= Math.ceil(x1); tx++) {
        if (!isWater(this.tile(tx, ty))) continue;
        const h = hash2(tx, ty, 404);
        const phase = Math.sin(time * 0.0016 + h * TAU);
        if (phase < 0.2) continue;
        const px = tx + 0.2 + h * 0.5;
        const py = ty + 0.25 + hash2(ty, tx, 405) * 0.5;
        g.strokeStyle = `rgba(235, 247, 255, ${(phase - 0.2) * 0.45})`;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + 0.22, py);
        g.stroke();
      }
    }
  }

  /** Respingos da fonte da vila. Espera transformação de mundo. */
  drawFountainSpray(g: Ctx, time: number): void {
    const f = this.map.fountain;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    for (let i = 0; i < 6; i++) {
      const t = ((time * 0.0012 + i / 6) % 1 + 1) % 1;
      const angle = (i / 6) * TAU + time * 0.0003;
      const r = 0.12 + t * 0.45;
      circle(g, cx + Math.cos(angle) * r, cy - 0.25 + Math.sin(angle) * r * 0.5 - Math.sin(t * Math.PI) * 0.35, 0.035, `rgba(230, 245, 255, ${0.8 * (1 - t)})`);
    }
  }

  private tile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return Tile.Tree;
    return tileAt(this.map, tx, ty);
  }

  private chunk(cx: number, cy: number): HTMLCanvasElement {
    const key = (cy + 512) * 1024 + (cx + 512);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const canvas = this.renderChunk(cx, cy);
    this.cache.set(key, canvas);
    if (this.cache.size > MAX_CHUNKS) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return canvas;
  }

  private renderChunk(cx: number, cy: number): HTMLCanvasElement {
    const size = CHUNK * this.tilePx;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d") as Ctx;
    g.setTransform(this.tilePx, 0, 0, this.tilePx, -cx * size, -cy * size);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;

    for (let ty = y0 - 1; ty <= y0 + CHUNK; ty++) {
      for (let tx = x0 - 1; tx <= x0 + CHUNK; tx++) this.ground(g, tx, ty);
    }
    for (const house of this.map.houses) {
      if (intersects(house, x0 - 1, y0 - 1, CHUNK + 2)) this.house(g, house);
    }
    if (intersects(this.map.fountain, x0 - 1, y0 - 1, CHUNK + 2)) this.fountain(g, this.map.fountain);
    // Objetos linha a linha: os de baixo cobrem os de cima (profundidade 3/4).
    for (let ty = y0 - 1; ty <= y0 + CHUNK + 1; ty++) {
      for (let tx = x0 - 1; tx <= x0 + CHUNK; tx++) {
        const t = this.tile(tx, ty);
        if (t === Tile.Tree) this.tree(g, tx, ty);
        else if (t === Tile.Rock) this.rock(g, tx, ty);
      }
    }
    return canvas;
  }

  private ground(g: Ctx, tx: number, ty: number): void {
    const t = this.tile(tx, ty);
    const h = hash2(tx, ty, 101);
    switch (t) {
      case Tile.Grass:
      case Tile.Flowers:
      case Tile.Rock:
        this.grass(g, tx, ty, h, GRASS, t === Tile.Flowers);
        break;
      case Tile.DarkGrass:
      case Tile.Tree:
        this.grass(g, tx, ty, h, FOREST_FLOOR, false);
        break;
      case Tile.Dirt:
        this.dirt(g, tx, ty, h);
        break;
      case Tile.Sand:
        g.fillStyle = pick(SAND, h);
        g.fillRect(tx, ty, 1, 1);
        for (let i = 0; i < 3; i++) {
          circle(g, tx + hash2(tx + i, ty, 31), ty + hash2(tx, ty + i, 37), 0.025, "rgba(150, 120, 70, 0.35)");
        }
        break;
      case Tile.Water:
      case Tile.DeepWater:
        this.water(g, tx, ty, t);
        break;
      case Tile.Bridge:
        this.water(g, tx, ty, Tile.Water);
        this.bridge(g, tx, ty);
        break;
      default:
        this.stone(g, tx, ty, h);
    }
  }

  private grass(g: Ctx, tx: number, ty: number, h: number, palette: readonly string[], flowers: boolean): void {
    g.fillStyle = pick(palette, h);
    g.fillRect(tx, ty, 1, 1);
    const dark = palette === FOREST_FLOOR;
    g.lineWidth = 0.035;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const px = tx + 0.1 + hash2(tx * 3 + i, ty, 7) * 0.8;
      const py = ty + 0.15 + hash2(tx, ty * 3 + i, 11) * 0.8;
      g.strokeStyle = i === 0 ? (dark ? "#4f8f45" : "#78ba63") : dark ? "#2f6a2e" : "#4a873b";
      g.beginPath();
      g.moveTo(px - 0.04, py);
      g.lineTo(px - 0.065, py - 0.09);
      g.moveTo(px, py);
      g.lineTo(px, py - 0.11);
      g.moveTo(px + 0.04, py);
      g.lineTo(px + 0.07, py - 0.08);
      g.stroke();
    }
    if (flowers) {
      for (let i = 0; i < 4; i++) {
        const px = tx + 0.12 + hash2(tx + i * 7, ty, 21) * 0.76;
        const py = ty + 0.12 + hash2(tx, ty + i * 7, 23) * 0.76;
        circle(g, px, py, 0.045, pick(FLOWERS, hash2(tx + i, ty + i, 29)));
        circle(g, px, py, 0.018, "#e3a33b");
      }
    }
  }

  private dirt(g: Ctx, tx: number, ty: number, h: number): void {
    g.fillStyle = pick(DIRT, h);
    g.fillRect(tx, ty, 1, 1);
    // Bordas irregulares de grama onde a estrada encontra o campo.
    const sides: [number, number, number, number, number, number][] = [
      [0, -1, tx, ty, 1, 0],
      [0, 1, tx, ty + 1, 1, 0],
      [-1, 0, tx, ty, 0, 1],
      [1, 0, tx + 1, ty, 0, 1],
    ];
    for (const [dx, dy, ex, ey, sx, sy] of sides) {
      if (!isGrassy(this.tile(tx + dx, ty + dy))) continue;
      g.fillStyle = pick(GRASS, hash2(tx + dx, ty + dy, 101));
      for (let i = 0; i < 4; i++) {
        const k = (i + 0.5) / 4 + (hash2(tx * 5 + i, ty * 5 + dx + dy * 3, 41) - 0.5) * 0.12;
        const r = 0.06 + hash2(tx + i, ty - i, 43) * 0.07;
        g.beginPath();
        g.arc(ex + sx * k, ey + sy * k, r, 0, TAU);
        g.fill();
      }
    }
    for (let i = 0; i < 2; i++) {
      const px = tx + 0.15 + hash2(tx + i * 3, ty, 51) * 0.7;
      const py = ty + 0.15 + hash2(tx, ty + i * 3, 53) * 0.7;
      ellipse(g, px, py, 0.045, 0.032, "#8f6c44");
      ellipse(g, px - 0.01, py - 0.012, 0.02, 0.012, "#cfae80");
    }
  }

  private water(g: Ctx, tx: number, ty: number, t: number): void {
    g.fillStyle = t === Tile.DeepWater ? "#2c67a5" : "#3a7cc0";
    g.fillRect(tx, ty, 1, 1);
    const sides: [number, number, number, number, number, number][] = [
      [0, -1, tx, ty, 1, 0.16],
      [0, 1, tx, ty + 0.84, 1, 0.16],
      [-1, 0, tx, ty, 0.16, 1],
      [1, 0, tx + 0.84, ty, 0.16, 1],
    ];
    for (const [dx, dy, x, y, w, hgt] of sides) {
      const n = this.tile(tx + dx, ty + dy);
      if (isWater(n) || n === Tile.Bridge) continue;
      g.fillStyle = "rgba(143, 198, 232, 0.55)";
      g.fillRect(x, y, w, hgt);
      g.fillStyle = "rgba(240, 249, 255, 0.6)";
      const fw = w === 1 ? 1 : 0.045;
      const fh = hgt === 1 ? 1 : 0.045;
      g.fillRect(dx === 1 ? tx + 1 - fw : x, dy === 1 ? ty + 1 - fh : y, fw, fh);
    }
  }

  private bridge(g: Ctx, tx: number, ty: number): void {
    const run = (dx: number, dy: number) => {
      let n = 0;
      for (let i = 1; i <= 4; i++) if (this.tile(tx + dx * i, ty + dy * i) === Tile.Bridge) n++;
      return n;
    };
    const vertical = run(0, 1) + run(0, -1) >= run(1, 0) + run(-1, 0);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 === 0 ? "#9b6a3c" : "#8d5f35";
      if (vertical) g.fillRect(tx, ty + i * 0.25, 1, 0.23);
      else g.fillRect(tx + i * 0.25, ty, 0.23, 1);
    }
    g.fillStyle = "#5e3d20";
    if (vertical) {
      if (isWater(this.tile(tx - 1, ty))) g.fillRect(tx, ty, 0.07, 1);
      if (isWater(this.tile(tx + 1, ty))) g.fillRect(tx + 0.93, ty, 0.07, 1);
    } else {
      if (isWater(this.tile(tx, ty - 1))) g.fillRect(tx, ty, 1, 0.07);
      if (isWater(this.tile(tx, ty + 1))) g.fillRect(tx, ty + 0.93, 1, 0.07);
    }
  }

  private stone(g: Ctx, tx: number, ty: number, h: number): void {
    g.fillStyle = pick(STONE, h);
    g.fillRect(tx, ty, 1, 1);
    g.strokeStyle = "rgba(90, 80, 65, 0.28)";
    g.lineWidth = 0.03;
    const offset = h < 0.5 ? 0.25 : 0.75;
    g.beginPath();
    g.moveTo(tx, ty + 0.5);
    g.lineTo(tx + 1, ty + 0.5);
    g.moveTo(tx, ty);
    g.lineTo(tx + 1, ty);
    g.moveTo(tx + offset, ty);
    g.lineTo(tx + offset, ty + 0.5);
    g.moveTo(tx + ((offset + 0.5) % 1), ty + 0.5);
    g.lineTo(tx + ((offset + 0.5) % 1), ty + 1);
    g.stroke();
    g.fillStyle = "rgba(255, 255, 255, 0.07)";
    g.fillRect(tx + 0.04, ty + 0.04, 0.4, 0.08);
  }

  private tree(g: Ctx, tx: number, ty: number): void {
    const h = hash2(tx, ty, 303);
    const cx = tx + 0.5 + (hash2(tx, ty, 307) - 0.5) * 0.12;
    const cy = ty + 0.55;
    ellipse(g, cx + 0.06, ty + 0.92, 0.42, 0.13, "rgba(0, 0, 0, 0.28)");
    if (h < 0.62) {
      fillRoundRect(g, cx - 0.06, cy - 0.05, 0.12, 0.38, 0.03, "#6b4a2b");
      circle(g, cx, cy - 0.3, 0.42, "#2c6630");
      circle(g, cx - 0.08, cy - 0.38, 0.33, "#3c8639");
      circle(g, cx + 0.14, cy - 0.24, 0.2, "#357a35");
      circle(g, cx - 0.16, cy - 0.5, 0.15, "#5aa64b");
      circle(g, cx + 0.05, cy - 0.58, 0.08, "#6db85a");
    } else {
      fillRoundRect(g, cx - 0.05, cy + 0.05, 0.1, 0.28, 0.02, "#5a3c22");
      const layers: [number, number, string][] = [
        [0.12, 0.4, "#1f5533"],
        [-0.14, 0.32, "#28663d"],
        [-0.38, 0.22, "#317548"],
      ];
      for (const [y, w, color] of layers) {
        g.beginPath();
        g.moveTo(cx - w, cy + y);
        g.lineTo(cx, cy + y - 0.5);
        g.lineTo(cx + w, cy + y);
        g.closePath();
        g.fillStyle = color;
        g.fill();
      }
    }
  }

  private rock(g: Ctx, tx: number, ty: number): void {
    const cx = tx + 0.5;
    const cy = ty + 0.62;
    ellipse(g, cx + 0.05, cy + 0.14, 0.36, 0.11, "rgba(0, 0, 0, 0.25)");
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const r = 0.26 + hash2(tx * 7 + i, ty, 313) * 0.1;
      g.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 0.75 - 0.08);
    }
    g.closePath();
    g.fillStyle = "#8a8b86";
    g.fill();
    outline(g, 0.025, "rgba(40, 40, 38, 0.5)");
    ellipse(g, cx - 0.06, cy - 0.17, 0.16, 0.08, "#b2b3ad");
  }

  private house(g: Ctx, r: Rect): void {
    const wallTop = r.y + r.h - 0.55;
    ellipse(g, r.x + r.w / 2 + 0.1, r.y + r.h + 0.02, r.w * 0.55, 0.16, "rgba(0, 0, 0, 0.3)");
    g.fillStyle = "#d8c7a4";
    g.fillRect(r.x + 0.08, wallTop, r.w - 0.16, 0.55);
    g.fillStyle = "#b9a682";
    g.fillRect(r.x + 0.08, r.y + r.h - 0.08, r.w - 0.16, 0.08);
    fillRoundRect(g, r.x + r.w / 2 - 0.15, r.y + r.h - 0.45, 0.3, 0.45, 0.06, "#5b3a22");
    for (const wx of [r.x + 0.32, r.x + r.w - 0.62]) {
      g.fillStyle = "#3c5a74";
      g.fillRect(wx, wallTop + 0.12, 0.3, 0.22);
      g.fillStyle = "#f0d58a";
      g.fillRect(wx + 0.04, wallTop + 0.16, 0.1, 0.07);
    }
    const roofTop = r.y - 0.35;
    g.beginPath();
    g.moveTo(r.x - 0.12, wallTop + 0.05);
    g.lineTo(r.x + 0.15, roofTop);
    g.lineTo(r.x + r.w - 0.15, roofTop);
    g.lineTo(r.x + r.w + 0.12, wallTop + 0.05);
    g.closePath();
    const grad = g.createLinearGradient(0, roofTop, 0, wallTop);
    grad.addColorStop(0, "#c2593c");
    grad.addColorStop(1, "#8d3a27");
    g.fillStyle = grad;
    g.fill();
    outline(g, 0.03, "rgba(60, 20, 10, 0.55)");
    g.strokeStyle = "rgba(70, 20, 10, 0.35)";
    g.lineWidth = 0.025;
    for (let y = roofTop + 0.3; y < wallTop; y += 0.3) {
      g.beginPath();
      g.moveTo(r.x, y);
      g.lineTo(r.x + r.w, y);
      g.stroke();
    }
    g.fillStyle = "#5b4d44";
    g.fillRect(r.x + r.w - 0.7, roofTop - 0.22, 0.2, 0.32);
  }

  private fountain(g: Ctx, r: Rect): void {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ellipse(g, cx + 0.06, cy + 0.12, 0.98, 0.88, "rgba(0, 0, 0, 0.22)");
    circle(g, cx, cy, 0.95, "#bdb5a3");
    g.beginPath();
    g.arc(cx, cy, 0.95, 0, TAU);
    outline(g, 0.035, "rgba(70, 60, 45, 0.5)");
    circle(g, cx, cy, 0.74, "#4f9fd8");
    circle(g, cx - 0.2, cy - 0.25, 0.25, "rgba(255, 255, 255, 0.12)");
    circle(g, cx, cy, 0.24, "#d9d1c0");
    circle(g, cx, cy - 0.06, 0.13, "#6db3e6");
  }
}

function intersects(r: Rect, x: number, y: number, size: number): boolean {
  return r.x - 1 < x + size && r.x + r.w + 1 > x && r.y - 1 < y + size && r.y + r.h + 1 > y;
}
