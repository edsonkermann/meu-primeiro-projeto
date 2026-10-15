import { VIEW_HALF_HEIGHT, VIEW_HALF_WIDTH } from "../../shared/constants";
import { CLASSES } from "../../shared/data/classes";
import { ITEMS, RARITY_COLORS } from "../../shared/data/items";
import { MONSTERS } from "../../shared/data/monsters";
import type { GameMap } from "../../shared/map";
import { clamp } from "../../shared/math";
import { UI_FONT } from "../dom";
import type { ClientEntity, ClientState } from "../state";
import { Effects } from "./effects";
import { alpha, TAU, type Ctx } from "./paint";
import { drawItemIcon, drawMonster, drawPlayer, type Pose } from "./sprites";
import { TerrainRenderer } from "./terrain";

const ATTACK_ANIM_MS = 320;
const HIT_FLASH_MS = 160;

export interface FrameInfo {
  state: ClientState;
  now: number;
  dt: number;
  targetId: number | null;
  hoverId: number | null;
}

/** Desenha o mundo: terreno, entidades em ordem de profundidade, efeitos e textos. */
export class Renderer {
  readonly effects = new Effects();
  private readonly g: Ctx;
  private map: GameMap;
  private terrain: TerrainRenderer;
  private dpr = 1;
  cssW = 0;
  cssH = 0;
  tileCss = 40;
  private tilePx = 80;
  camX = 0;
  camY = 0;
  private originX = 0;
  private originY = 0;
  private cameraReady = false;
  private vignette: CanvasGradient | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    map: GameMap,
  ) {
    this.g = canvas.getContext("2d", { alpha: false }) as Ctx;
    this.map = map;
    this.terrain = new TerrainRenderer(map);
    this.camX = map.town.x;
    this.camY = map.town.y;
    this.resize();
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.terrain = new TerrainRenderer(map);
    this.cameraReady = false;
  }

  resize(): void {
    this.cssW = Math.max(1, window.innerWidth);
    this.cssH = Math.max(1, window.innerHeight);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    // Tamanho do tile: confortável na tela, mas nunca mostrando além da área de interesse do servidor.
    let tile = clamp(Math.min(this.cssW / 26, this.cssH / 15), 24, 56);
    tile = Math.max(tile, this.cssW / (2 * (VIEW_HALF_WIDTH - 1)), this.cssH / (2 * (VIEW_HALF_HEIGHT - 1)));
    this.tilePx = Math.max(8, Math.round(tile * this.dpr));
    this.tileCss = this.tilePx / this.dpr;
    this.vignette = null;
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(this.originX + x * this.tilePx) / this.dpr, (this.originY + y * this.tilePx) / this.dpr];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx * this.dpr - this.originX) / this.tilePx, (sy * this.dpr - this.originY) / this.tilePx];
  }

  /** Entidade sob o cursor: considera a altura do sprite, não só o ponto dos pés. */
  pick(sx: number, sy: number, state: ClientState): ClientEntity | null {
    const [wx, wy] = this.screenToWorld(sx, sy);
    let best: ClientEntity | null = null;
    let bestScore = Infinity;
    for (const entity of state.entities.values()) {
      if (entity.removedAt !== null) continue;
      const view = entity.view;
      let height = 0.8;
      let priority = 0;
      if (view.k === "m") {
        height = MONSTERS[view.mid].size * 2.1;
        priority = -0.3;
      } else if (view.k === "i") {
        height = 0.5;
        priority = -0.15;
      } else if (view.dead || view.id === state.youId) {
        continue;
      }
      const radius = Math.max(0.42, height * 0.55);
      const cy = entity.y - height / 2;
      const d = Math.hypot(wx - entity.x, wy - cy) / radius;
      if (d <= 1 && d + priority < bestScore) {
        best = entity;
        bestScore = d + priority;
      }
    }
    return best;
  }

  private updateCamera(targetX: number, targetY: number, dt: number): void {
    if (!this.cameraReady) {
      this.camX = targetX;
      this.camY = targetY;
      this.cameraReady = true;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      this.camX += (targetX - this.camX) * k;
      this.camY += (targetY - this.camY) * k;
    }
    this.originX = Math.round(this.canvas.width / 2 - this.camX * this.tilePx);
    this.originY = Math.round(this.canvas.height / 2 - this.camY * this.tilePx);
  }

  private drawTerrain(now: number, reducedMotion: boolean): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#16261b";
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.terrain.draw(g, this.originX, this.originY, this.tilePx, this.canvas.width, this.canvas.height);
    this.setWorldTransform();
    const x0 = -this.originX / this.tilePx;
    const y0 = -this.originY / this.tilePx;
    const x1 = x0 + this.canvas.width / this.tilePx;
    const y1 = y0 + this.canvas.height / this.tilePx;
    if (!reducedMotion) {
      this.terrain.drawWaterShimmer(g, x0, y0, x1, y1, now);
      const f = this.map.fountain;
      if (f.x + 2 > x0 && f.x - 1 < x1 && f.y + 2 > y0 && f.y - 1 < y1) this.terrain.drawFountainSpray(g, now);
    }
  }

  private setWorldTransform(): void {
    this.g.setTransform(this.tilePx, 0, 0, this.tilePx, this.originX, this.originY);
  }

  private setScreenTransform(): void {
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private drawVignette(lowHealth: number): void {
    const g = this.g;
    this.setScreenTransform();
    if (!this.vignette) {
      const r = Math.hypot(this.cssW, this.cssH) / 2;
      this.vignette = g.createRadialGradient(this.cssW / 2, this.cssH / 2, r * 0.45, this.cssW / 2, this.cssH / 2, r);
      this.vignette.addColorStop(0, "rgba(10, 14, 12, 0)");
      this.vignette.addColorStop(1, "rgba(10, 14, 12, 0.55)");
    }
    g.fillStyle = this.vignette;
    g.fillRect(0, 0, this.cssW, this.cssH);
    if (lowHealth > 0) {
      const r = Math.hypot(this.cssW, this.cssH) / 2;
      const danger = g.createRadialGradient(this.cssW / 2, this.cssH / 2, r * 0.55, this.cssW / 2, this.cssH / 2, r);
      danger.addColorStop(0, "rgba(160, 20, 10, 0)");
      danger.addColorStop(1, `rgba(160, 20, 10, ${0.45 * lowHealth})`);
      g.fillStyle = danger;
      g.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  /** Tela de título: um voo lento ao redor da vila, sem entidades. */
  drawBackdrop(now: number, dt: number, reducedMotion: boolean): void {
    const angle = reducedMotion ? 0.6 : now * 0.00004;
    const tx = this.map.town.x + Math.cos(angle) * 9;
    const ty = this.map.town.y + Math.sin(angle) * 6 + 2;
    this.updateCamera(tx, ty, dt);
    this.drawTerrain(now, reducedMotion);
    this.drawVignette(0);
  }

  draw(frame: FrameInfo, reducedMotion: boolean): void {
    const { state, now } = frame;
    const me = state.selfEntity;
    this.updateCamera(me ? me.x : this.camX, me ? me.y - 0.3 : this.camY, frame.dt);
    this.drawTerrain(now, reducedMotion);

    const g = this.g;
    this.setWorldTransform();
    const x0 = -this.originX / this.tilePx - 2;
    const y0 = -this.originY / this.tilePx - 2;
    const x1 = x0 + this.canvas.width / this.tilePx + 4;
    const y1 = y0 + this.canvas.height / this.tilePx + 4;

    const items: ClientEntity[] = [];
    const actors: ClientEntity[] = [];
    for (const entity of state.entities.values()) {
      if (entity.x < x0 || entity.x > x1 || entity.y < y0 || entity.y > y1) continue;
      if (entity.view.k === "i") items.push(entity);
      else actors.push(entity);
    }
    actors.sort((a, b) => a.y - b.y);

    // Anéis de seleção ficam no chão, sob as entidades.
    for (const entity of actors) {
      if (entity.view.k !== "m") continue;
      const size = MONSTERS[entity.view.mid].size;
      if (entity.id === frame.targetId) this.selectionRing(entity, size, "#ff8a5c", now, true);
      else if (entity.id === frame.hoverId) this.selectionRing(entity, size, "#f4ecd8", now, false);
    }

    for (const entity of items) this.drawGroundItem(entity, now, entity.id === frame.hoverId, reducedMotion);
    for (const entity of actors) this.drawActor(entity, state, now);
    this.effects.drawWorld(g, now);

    // Textos e barras, em pixels de tela.
    this.setScreenTransform();
    for (const entity of items) if (entity.id === frame.hoverId) this.itemLabel(entity);
    for (const entity of actors) this.plate(entity, state, frame);
    this.effects.drawTexts(g, now, (x, y) => this.worldToScreen(x, y), this.tileCss);

    const self = state.self;
    const lowHealth = self && !self.dead && self.hp / self.stats.maxHp < 0.3 ? 0.6 + 0.4 * Math.sin(now * 0.006) : 0;
    this.drawVignette(lowHealth);
  }

  private pose(entity: ClientEntity, now: number): Pose {
    const attackT = (now - entity.attackAt) / ATTACK_ANIM_MS;
    return {
      time: now,
      facing: entity.facing,
      moving: entity.moving,
      attack: attackT >= 0 && attackT < 1 ? attackT : -1,
      flash: Math.max(0, 1 - (now - entity.hitAt) / HIT_FLASH_MS),
      seed: entity.id * 1.37,
    };
  }

  private drawActor(entity: ClientEntity, state: ClientState, now: number): void {
    const g = this.g;
    const view = entity.view;
    g.save();
    g.translate(entity.x, entity.y);
    g.globalAlpha = Math.min(1, (now - entity.bornAt) / 250);
    if (view.k === "p") {
      drawPlayer(g, view.cls, this.pose(entity, now), { self: view.id === state.youId, dead: view.dead });
    } else if (view.k === "m") {
      drawMonster(g, MONSTERS[view.mid], this.pose(entity, now), { evade: view.evade });
    }
    g.restore();
  }

  private drawGroundItem(entity: ClientEntity, now: number, hovered: boolean, reducedMotion: boolean): void {
    if (entity.view.k !== "i") return;
    const def = ITEMS[entity.view.item];
    if (!def) return;
    const g = this.g;
    const bob = reducedMotion ? 0 : Math.sin(now * 0.004 + entity.id) * 0.04;
    g.save();
    g.translate(entity.x, entity.y);
    g.globalAlpha = Math.min(1, (now - entity.bornAt) / 200) * (entity.view.lock === 2 ? 0.55 : 1);
    g.beginPath();
    g.ellipse(0, 0.02, 0.2, 0.08, 0, 0, TAU);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fill();
    const glowColor = def.kind === "gold" ? "#ecc75e" : RARITY_COLORS[def.rarity];
    const glow = g.createRadialGradient(0, -0.22 + bob, 0, 0, -0.22 + bob, hovered ? 0.5 : 0.38);
    glow.addColorStop(0, alpha(glowColor, hovered ? 0.55 : 0.38));
    glow.addColorStop(1, alpha(glowColor, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, -0.22 + bob, hovered ? 0.5 : 0.38, 0, TAU);
    g.fill();
    g.translate(0, -0.24 + bob);
    g.scale(0.46, 0.46);
    drawItemIcon(g, def.icon, def.rarity);
    g.restore();
  }

  private selectionRing(entity: ClientEntity, size: number, color: string, now: number, dashed: boolean): void {
    const g = this.g;
    const rx = Math.max(0.36, size * 1.1);
    g.save();
    g.translate(entity.x, entity.y);
    g.beginPath();
    g.ellipse(0, 0, rx, rx * 0.42, 0, 0, TAU);
    g.strokeStyle = alpha(color, 0.9);
    g.lineWidth = 0.045;
    if (dashed) {
      g.setLineDash([0.18, 0.1]);
      g.lineDashOffset = -now * 0.0006;
    }
    g.stroke();
    g.restore();
  }

  private itemLabel(entity: ClientEntity): void {
    if (entity.view.k !== "i") return;
    const def = ITEMS[entity.view.item];
    if (!def) return;
    const [sx, sy] = this.worldToScreen(entity.x, entity.y - 0.6);
    const text = def.kind === "gold" ? `${entity.view.qty} de ouro` : entity.view.qty > 1 ? `${def.name} x${entity.view.qty}` : def.name;
    this.label(text, sx, sy, def.kind === "gold" ? "#ecc75e" : RARITY_COLORS[def.rarity], 13);
  }

  private label(text: string, x: number, y: number, color: string, size: number, weight = 700): void {
    const g = this.g;
    g.font = `${weight} ${size}px ${UI_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 3.5;
    g.strokeStyle = "rgba(12, 9, 6, 0.8)";
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  private bar(x: number, y: number, width: number, ratio: number, color: string): void {
    const g = this.g;
    g.fillStyle = "rgba(12, 9, 6, 0.8)";
    g.fillRect(x - width / 2 - 1, y - 1, width + 2, 6);
    g.fillStyle = "rgba(80, 20, 15, 0.9)";
    g.fillRect(x - width / 2, y, width, 4);
    g.fillStyle = color;
    g.fillRect(x - width / 2, y, width * clamp(ratio, 0, 1), 4);
  }

  private plate(entity: ClientEntity, state: ClientState, frame: FrameInfo): void {
    const view = entity.view;
    if (view.k === "p") {
      if (view.dead) return;
      const top = view.cls === "mago" ? 1.2 : 1.02;
      const [sx, sy] = this.worldToScreen(entity.x, entity.y - top);
      const isSelf = view.id === state.youId;
      const color = isSelf ? "#ebc777" : view.bot ? "#c9d4d0" : "#f4ecd8";
      this.label(`${view.name}${view.bot ? " (bot)" : ""}`, sx, sy - 6, color, 13, 800);
      this.label(`Nv ${view.lvl} · ${CLASSES[view.cls].name}`, sx, sy + 8, alpha("#d8cfb9", 0.95), 11, 600);
      if (!isSelf && view.hp < view.mhp) this.bar(sx, sy + 17, 36, view.hp / view.mhp, "#d4473a");
      return;
    }
    if (view.k !== "m") return;
    const def = MONSTERS[view.mid];
    const focused = entity.id === frame.targetId || entity.id === frame.hoverId;
    const showBar = def.boss || focused || view.hp < view.mhp;
    if (!showBar) return;
    const [sx, sy] = this.worldToScreen(entity.x, entity.y - def.size * 2.25 - 0.08);
    const width = def.boss ? 110 : 46;
    this.bar(sx, sy, width, view.hp / view.mhp, view.evade ? "#9aa3ad" : "#e05a3f");
    if (def.boss || focused) {
      const myLevel = state.self?.level ?? 1;
      this.label(`${def.name} · Nv ${def.level}`, sx, sy - 10, levelColor(def.level - myLevel), 12.5, 800);
    }
  }

  /** Converte o ponto de um clique para coordenada de mundo, para o marcador de destino. */
  clickMarker(sx: number, sy: number, now: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.effects.ring(wx, wy, 0.35, "click", "#ebc777", now, 420);
  }
}

/** Cor do nome do monstro conforme a diferença de nível (convenção clássica de MMORPG). */
export function levelColor(diff: number): string {
  if (diff >= 5) return "#ff5a4a";
  if (diff >= 2) return "#ffa64d";
  if (diff >= -2) return "#f4ecd8";
  if (diff >= -5) return "#7fd88f";
  return "#a8a8a8";
}
