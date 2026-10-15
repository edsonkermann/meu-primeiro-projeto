import type { MonsterDef } from "../../shared/data/monsters";
import { UI_FONT } from "../dom";
import { alpha, circle, easeOut, TAU, type Ctx } from "./paint";
import { drawMonster } from "./sprites";

/** Efeitos visuais de curta duração: números de dano, projéteis, explosões e restos de monstros. */

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  start: number;
  duration: number;
  drift: number;
}

export type ProjectileKind = "arrow" | "orb";

interface Projectile {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  kind: ProjectileKind;
  color: string;
  start: number;
  duration: number;
}

export type RingStyle = "impact" | "slash" | "rain" | "arcane" | "level" | "click" | "heal";

interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  style: RingStyle;
  start: number;
  duration: number;
  seed: number;
}

interface Corpse {
  x: number;
  y: number;
  def: MonsterDef;
  facing: number;
  start: number;
  seed: number;
}

const CORPSE_MS = 650;

export class Effects {
  private texts: FloatText[] = [];
  private projectiles: Projectile[] = [];
  private rings: Ring[] = [];
  private corpses: Corpse[] = [];

  text(x: number, y: number, text: string, color: string, now: number, size = 18, duration = 1000): void {
    if (this.texts.length > 80) this.texts.shift();
    this.texts.push({ x, y, text, color, size, start: now, duration, drift: (Math.random() - 0.5) * 0.5 });
  }

  projectile(fromX: number, fromY: number, toX: number, toY: number, kind: ProjectileKind, color: string, now: number): void {
    const distance = Math.hypot(toX - fromX, toY - fromY);
    this.projectiles.push({ fromX, fromY, toX, toY, kind, color, start: now, duration: 60 + distance * 32 });
  }

  ring(x: number, y: number, r: number, style: RingStyle, color: string, now: number, duration = 450): void {
    this.rings.push({ x, y, r, style, color, start: now, duration, seed: Math.random() * 1000 });
  }

  corpse(x: number, y: number, def: MonsterDef, facing: number, now: number, seed: number): void {
    this.corpses.push({ x, y, def, facing, start: now, seed });
  }

  /** Camada do mundo: espera a transformação de mundo (1 unidade = 1 tile). */
  drawWorld(g: Ctx, now: number): void {
    this.corpses = this.corpses.filter((c) => now - c.start < CORPSE_MS);
    for (const c of this.corpses) {
      const p = (now - c.start) / CORPSE_MS;
      g.save();
      g.translate(c.x, c.y);
      g.globalAlpha = 1 - p;
      g.scale(1 + p * 0.25, 1 - p * 0.6);
      drawMonster(g, c.def, { time: c.start, facing: c.facing, moving: false, attack: -1, flash: 1 - p, seed: c.seed }, { evade: false });
      g.restore();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + c.seed;
        circle(g, c.x + Math.cos(a) * p * 0.6, c.y - 0.3 + Math.sin(a) * p * 0.4 - p * 0.3, 0.05 * (1 - p), alpha("#e8e2d0", 0.8));
      }
    }

    this.rings = this.rings.filter((r) => now - r.start < r.duration);
    for (const ring of this.rings) this.drawRing(g, ring, (now - ring.start) / ring.duration);

    this.projectiles = this.projectiles.filter((p) => now - p.start < p.duration);
    for (const p of this.projectiles) {
      const t = (now - p.start) / p.duration;
      const x = p.fromX + (p.toX - p.fromX) * t;
      const y = p.fromY + (p.toY - p.fromY) * t;
      const angle = Math.atan2(p.toY - p.fromY, p.toX - p.fromX);
      if (p.kind === "arrow") {
        g.save();
        g.translate(x, y);
        g.rotate(angle);
        g.strokeStyle = "#e9dcc0";
        g.lineWidth = 0.035;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(-0.3, 0);
        g.lineTo(0.05, 0);
        g.stroke();
        g.beginPath();
        g.moveTo(0.12, 0);
        g.lineTo(0.02, -0.045);
        g.lineTo(0.02, 0.045);
        g.closePath();
        g.fillStyle = "#c9ccd1";
        g.fill();
        g.restore();
      } else {
        for (let i = 4; i >= 0; i--) {
          const k = Math.max(0, t - i * 0.05);
          circle(
            g,
            p.fromX + (p.toX - p.fromX) * k,
            p.fromY + (p.toY - p.fromY) * k,
            0.05 + (4 - i) * 0.018,
            alpha(p.color, 0.18 + (4 - i) * 0.16),
          );
        }
        circle(g, x, y, 0.06, "#ffffff");
      }
    }
  }

  private drawRing(g: Ctx, ring: Ring, p: number): void {
    const { x, y, r, color } = ring;
    switch (ring.style) {
      case "impact": {
        g.beginPath();
        g.ellipse(x, y, r * easeOut(p), r * easeOut(p) * 0.45, 0, 0, TAU);
        g.strokeStyle = alpha(color, 0.8 * (1 - p));
        g.lineWidth = 0.05;
        g.stroke();
        return;
      }
      case "slash": {
        const a0 = -2.3 + ring.seed;
        g.beginPath();
        g.arc(x, y - 0.4, r, a0, a0 + 2.4 * easeOut(p));
        g.strokeStyle = alpha(color, 0.95 * (1 - p));
        g.lineWidth = 0.12 * (1 - p) + 0.02;
        g.lineCap = "round";
        g.stroke();
        return;
      }
      case "rain": {
        for (let i = 0; i < 12; i++) {
          const a = i * 2.39996 + ring.seed;
          const d = r * Math.sqrt(((i * 0.618) % 1) * 0.9 + 0.05);
          const tx = x + Math.cos(a) * d;
          const ty = y + Math.sin(a) * d * 0.55;
          const fall = Math.min(1, p * 2.4 - (i % 4) * 0.12);
          if (fall <= 0) continue;
          if (fall < 1) {
            g.strokeStyle = "#e9dcc0";
            g.lineWidth = 0.03;
            g.beginPath();
            g.moveTo(tx - 0.12, ty - 1.4 * (1 - fall) - 0.3);
            g.lineTo(tx, ty - 1.4 * (1 - fall));
            g.stroke();
          } else {
            circle(g, tx, ty, 0.05 * (1.2 - p), alpha("#f5e7c4", 0.8 * (1 - p)));
          }
        }
        g.beginPath();
        g.ellipse(x, y, r, r * 0.5, 0, 0, TAU);
        g.strokeStyle = alpha(color, 0.6 * (1 - p));
        g.lineWidth = 0.04;
        g.stroke();
        return;
      }
      case "arcane": {
        const rr = r * (0.3 + 0.7 * easeOut(p));
        const glow = g.createRadialGradient(x, y - 0.2, 0, x, y - 0.2, rr);
        glow.addColorStop(0, alpha("#ffffff", 0.7 * (1 - p)));
        glow.addColorStop(0.4, alpha(color, 0.55 * (1 - p)));
        glow.addColorStop(1, alpha(color, 0));
        g.fillStyle = glow;
        g.beginPath();
        g.arc(x, y - 0.2, rr, 0, TAU);
        g.fill();
        g.beginPath();
        g.ellipse(x, y, rr, rr * 0.5, 0, 0, TAU);
        g.strokeStyle = alpha(color, 0.9 * (1 - p));
        g.lineWidth = 0.05;
        g.stroke();
        return;
      }
      case "level": {
        const column = g.createLinearGradient(x, y - 2.2, x, y);
        column.addColorStop(0, alpha(color, 0));
        column.addColorStop(1, alpha(color, 0.45 * (1 - p)));
        g.fillStyle = column;
        g.fillRect(x - 0.35, y - 2.2, 0.7, 2.2);
        g.beginPath();
        g.ellipse(x, y, 0.4 + p * 0.9, (0.4 + p * 0.9) * 0.45, 0, 0, TAU);
        g.strokeStyle = alpha(color, 0.9 * (1 - p));
        g.lineWidth = 0.06;
        g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + ring.seed;
          circle(g, x + Math.cos(a) * 0.3, y - p * 1.8 - (i % 3) * 0.2, 0.04, alpha(color, 1 - p));
        }
        return;
      }
      case "click": {
        const k = 1 - p;
        g.beginPath();
        g.ellipse(x, y, 0.32 * k + 0.08, (0.32 * k + 0.08) * 0.5, 0, 0, TAU);
        g.strokeStyle = alpha(color, 0.9 * k);
        g.lineWidth = 0.04;
        g.stroke();
        return;
      }
      case "heal": {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + ring.seed;
          circle(g, x + Math.cos(a) * 0.25, y - 0.2 - p * 0.9 - (i % 2) * 0.15, 0.045, alpha(color, 1 - p));
        }
        return;
      }
    }
  }

  /** Camada de textos: desenhada em pixels de tela (CSS) para ficar nítida. */
  drawTexts(g: Ctx, now: number, toScreen: (x: number, y: number) => [number, number], tileCss: number): void {
    this.texts = this.texts.filter((t) => now - t.start < t.duration);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    for (const t of this.texts) {
      const p = (now - t.start) / t.duration;
      const [sx, sy] = toScreen(t.x + t.drift * p, t.y);
      const rise = easeOut(p) * tileCss * 0.9;
      const pop = p < 0.12 ? 0.75 + (p / 0.12) * 0.35 : 1.1 - Math.min(0.1, (p - 0.12) * 0.4);
      g.font = `800 ${Math.round(t.size * pop)}px ${UI_FONT}`;
      g.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(15, 10, 6, 0.75)";
      g.strokeText(t.text, sx, sy - rise);
      g.fillStyle = t.color;
      g.fillText(t.text, sx, sy - rise);
    }
    g.globalAlpha = 1;
  }
}
