import { MONSTERS } from "../../shared/data/monsters";
import { Tile, type GameMap } from "../../shared/map";
import type { ClientState } from "../state";

const TILE_COLORS: Record<number, [number, number, number]> = {
  [Tile.Grass]: [90, 154, 71],
  [Tile.DarkGrass]: [63, 124, 57],
  [Tile.Flowers]: [106, 164, 82],
  [Tile.Dirt]: [177, 138, 89],
  [Tile.Sand]: [220, 200, 150],
  [Tile.Water]: [58, 124, 192],
  [Tile.DeepWater]: [44, 103, 165],
  [Tile.Tree]: [40, 88, 44],
  [Tile.Rock]: [125, 126, 121],
  [Tile.Stone]: [198, 191, 174],
  [Tile.House]: [161, 74, 51],
  [Tile.Fountain]: [79, 159, 216],
  [Tile.Bridge]: [155, 106, 60],
};

/** Minimapa: o terreno é pintado uma vez; os pontos das entidades, algumas vezes por segundo. */
export class Minimap {
  private readonly g: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly scale: number;
  private lastDraw = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: GameMap,
  ) {
    this.g = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.scale = canvas.width / map.width;
    this.base = document.createElement("canvas");
    this.base.width = map.width;
    this.base.height = map.height;
    const bg = this.base.getContext("2d") as CanvasRenderingContext2D;
    const image = bg.createImageData(map.width, map.height);
    for (let i = 0; i < map.tiles.length; i++) {
      const [r, g, b] = TILE_COLORS[map.tiles[i] as number] ?? [0, 0, 0];
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    bg.putImageData(image, 0, 0);
  }

  draw(state: ClientState, now: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (now - this.lastDraw < 150) return;
    this.lastDraw = now;
    const g = this.g;
    const s = this.scale;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);

    g.strokeStyle = "rgba(235, 199, 119, 0.9)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(this.map.town.x * s, this.map.town.y * s, (this.map.town.radius + 0.5) * s, 0, Math.PI * 2);
    g.stroke();

    for (const entity of state.entities.values()) {
      const view = entity.view;
      if (view.k === "i") {
        this.dot(entity.x, entity.y, 1.6, "#ecc75e");
      } else if (view.k === "m") {
        const boss = MONSTERS[view.mid].boss;
        this.dot(entity.x, entity.y, boss ? 4.2 : 2.2, boss ? "#c48bff" : "#e2553f");
      } else if (view.id !== state.youId) {
        this.dot(entity.x, entity.y, 2.6, view.bot ? "#9cc9c2" : "#6fd3ff");
      }
    }
    const me = state.selfEntity;
    if (me) {
      this.dot(me.x, me.y, 4, "#10171a");
      this.dot(me.x, me.y, 2.8, "#ffffff");
    }
    g.strokeStyle = "rgba(244, 236, 216, 0.6)";
    g.lineWidth = 1;
    g.strokeRect(view.x0 * s, view.y0 * s, (view.x1 - view.x0) * s, (view.y1 - view.y0) * s);
  }

  private dot(x: number, y: number, r: number, color: string): void {
    this.g.beginPath();
    this.g.arc(x * this.scale, y * this.scale, r, 0, Math.PI * 2);
    this.g.fillStyle = color;
    this.g.fill();
  }
}
