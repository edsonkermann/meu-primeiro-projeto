import { CLASSES, type ClassId, type SkillEffect } from "../../shared/data/classes";
import type { ItemIcon, Rarity } from "../../shared/data/items";
import type { MonsterDef } from "../../shared/data/monsters";
import {
  alpha,
  circle,
  easeOut,
  ellipse,
  fillRoundRect,
  groundShadow,
  line,
  outline,
  roundRect,
  shade,
  TAU,
  type Ctx,
} from "./paint";

/**
 * Sprites desenhados por código, em visão 3/4 (como nos RPGs 2D clássicos).
 * A origem é o ponto dos pés da entidade e a unidade é 1 tile.
 */
export interface Pose {
  /** performance.now() */
  time: number;
  facing: number;
  moving: boolean;
  /** Progresso do ataque de 0 a 1, ou -1 sem ataque em andamento. */
  attack: number;
  /** Brilho de dano recebido, de 0 a 1. */
  flash: number;
  seed: number;
}

const SKIN = "#f1c7a0";
const INK = "#2a1d14";

function facingFlip(facing: number): number {
  return Math.cos(facing) < -0.15 ? -1 : 1;
}

function hitFlash(g: Ctx, pose: Pose, x: number, y: number, w: number, h: number): void {
  if (pose.flash <= 0) return;
  g.save();
  g.globalAlpha *= pose.flash * 0.55;
  fillRoundRect(g, x, y, w, h, Math.min(w, h) * 0.35, "#ffffff");
  g.restore();
}

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------

export function drawPlayer(g: Ctx, cls: ClassId, pose: Pose, options: { self: boolean; dead: boolean }): void {
  if (options.dead) {
    drawGrave(g);
    return;
  }
  const def = CLASSES[cls];
  if (options.self) {
    g.beginPath();
    g.ellipse(0, 0, 0.36, 0.16, 0, 0, TAU);
    g.strokeStyle = "rgba(236, 199, 104, 0.9)";
    g.lineWidth = 0.035;
    g.stroke();
  }
  groundShadow(g, 0.22);

  const flip = facingFlip(pose.facing);
  const back = pose.moving && Math.sin(pose.facing) < -0.6;
  const step = pose.moving ? Math.sin(pose.time * 0.016 + pose.seed) : 0;
  const bob = pose.moving ? Math.abs(step) * 0.03 : Math.sin(pose.time * 0.003 + pose.seed) * 0.008;

  g.save();
  g.scale(flip, 1);
  g.translate(0, -bob);

  // Pernas
  fillRoundRect(g, -0.1, -0.21 + step * 0.03, 0.08, 0.21, 0.03, "#3a2c25");
  fillRoundRect(g, 0.02, -0.21 - step * 0.03, 0.08, 0.21, 0.03, "#3a2c25");

  if (back) drawWeapon(g, cls, pose);

  // Corpo
  roundRect(g, -0.16, -0.5, 0.32, 0.33, 0.09);
  const grad = g.createLinearGradient(0, -0.5, 0, -0.17);
  grad.addColorStop(0, shade(def.color, 0.18));
  grad.addColorStop(1, shade(def.color, -0.25));
  g.fillStyle = grad;
  g.fill();
  outline(g, 0.025);
  g.fillStyle = shade(def.color, -0.45);
  g.fillRect(-0.16, -0.26, 0.32, 0.04);

  if (cls === "guerreiro") {
    fillRoundRect(g, -0.11, -0.47, 0.22, 0.17, 0.05, "#b9c1c9");
    fillRoundRect(g, -0.09, -0.45, 0.07, 0.12, 0.03, "#dfe4e8");
  } else if (cls === "arqueira") {
    line(g, -0.14, -0.48, 0.13, -0.27, "#6e4524", 0.04);
  } else {
    line(g, 0, -0.48, 0, -0.27, def.accent, 0.03);
  }

  // Braços
  ellipse(g, -0.19, -0.35, 0.05, 0.1, shade(def.color, -0.12));
  ellipse(g, 0.19, -0.35, 0.05, 0.1, shade(def.color, -0.12));

  // Cabeça
  circle(g, 0, -0.62, 0.13, SKIN);
  if (cls === "guerreiro") {
    g.beginPath();
    g.arc(0, -0.62, 0.145, Math.PI, TAU);
    g.lineTo(0.145, -0.58);
    g.lineTo(-0.145, -0.58);
    g.closePath();
    g.fillStyle = "#aeb7c1";
    g.fill();
    outline(g, 0.02);
    g.beginPath();
    g.moveTo(-0.02, -0.77);
    g.quadraticCurveTo(-0.16, -0.86, -0.24, -0.72);
    g.strokeStyle = def.accent;
    g.lineWidth = 0.05;
    g.lineCap = "round";
    g.stroke();
    if (back) circle(g, 0, -0.62, 0.135, "#9aa3ad");
  } else if (cls === "arqueira") {
    circle(g, 0, -0.63, 0.155, "#24643f");
    if (!back) ellipse(g, 0.015, -0.6, 0.1, 0.105, SKIN);
    g.beginPath();
    g.moveTo(-0.12, -0.7);
    g.quadraticCurveTo(-0.26, -0.6, -0.2, -0.42);
    g.strokeStyle = "#1c4f32";
    g.lineWidth = 0.05;
    g.stroke();
  } else {
    ellipse(g, 0, -0.7, 0.23, 0.065, "#3a2f8c");
    g.beginPath();
    g.moveTo(-0.14, -0.72);
    g.lineTo(0.14, -0.72);
    g.quadraticCurveTo(0.08, -0.86, 0.12, -1.04);
    g.quadraticCurveTo(-0.06, -0.86, -0.14, -0.72);
    g.closePath();
    g.fillStyle = "#4536ad";
    g.fill();
    outline(g, 0.02);
    circle(g, 0.02, -0.82, 0.025, "#f4d27a");
  }

  if (!back) {
    circle(g, 0.035, -0.6, 0.018, INK);
    circle(g, 0.09, -0.6, 0.018, INK);
    drawWeapon(g, cls, pose);
  }
  hitFlash(g, pose, -0.17, -0.78, 0.34, 0.78);
  g.restore();
}

function drawWeapon(g: Ctx, cls: ClassId, pose: Pose): void {
  const def = CLASSES[cls];
  if (cls === "guerreiro") {
    const angle = pose.attack >= 0 ? -1.7 + 2.7 * easeOut(pose.attack) : -0.45;
    g.save();
    g.translate(0.2, -0.33);
    if (pose.attack >= 0 && pose.attack < 0.7) {
      g.beginPath();
      g.arc(0, 0, 0.42, -1.7 - Math.PI / 2, angle - Math.PI / 2);
      g.strokeStyle = `rgba(255, 245, 220, ${0.55 * (1 - pose.attack)})`;
      g.lineWidth = 0.07;
      g.stroke();
    }
    g.rotate(angle);
    roundRect(g, -0.024, -0.47, 0.048, 0.42, 0.015);
    g.fillStyle = "#e3e7eb";
    g.fill();
    outline(g, 0.015, "rgba(40, 45, 55, 0.6)");
    g.fillStyle = "#c9a24b";
    g.fillRect(-0.075, -0.07, 0.15, 0.035);
    g.fillStyle = "#5b3a22";
    g.fillRect(-0.018, -0.035, 0.036, 0.09);
    g.restore();
  } else if (cls === "arqueira") {
    const pull = pose.attack >= 0 ? Math.sin(Math.min(1, pose.attack) * Math.PI) : 0;
    g.save();
    g.translate(0.03, -0.36);
    g.beginPath();
    g.arc(0, 0, 0.25, -1.0, 1.0);
    g.strokeStyle = "#8a5a2b";
    g.lineWidth = 0.04;
    g.lineCap = "round";
    g.stroke();
    const ex = Math.cos(1.0) * 0.25;
    const ey = Math.sin(1.0) * 0.25;
    g.beginPath();
    g.moveTo(ex, -ey);
    g.lineTo(ex - 0.13 * pull, 0);
    g.lineTo(ex, ey);
    g.strokeStyle = "#efe6d6";
    g.lineWidth = 0.012;
    g.stroke();
    if (pull > 0.05) line(g, ex - 0.13 * pull, 0, 0.36, 0, "#d9c7a0", 0.02);
    g.restore();
  } else {
    const glow = pose.attack >= 0 ? 0.3 - 0.12 * pose.attack : 0.16;
    line(g, 0.21, 0.0, 0.25, -0.84, "#6b4a2b", 0.045);
    const halo = g.createRadialGradient(0.25, -0.88, 0, 0.25, -0.88, glow);
    halo.addColorStop(0, alpha(def.accent, 0.8));
    halo.addColorStop(1, alpha(def.accent, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0.25, -0.88, glow, 0, TAU);
    g.fill();
    circle(g, 0.25, -0.88, 0.06, def.accent);
    circle(g, 0.235, -0.895, 0.022, "#ffffff");
  }
}

export function drawGrave(g: Ctx): void {
  groundShadow(g, 0.2);
  roundRect(g, -0.14, -0.44, 0.28, 0.44, 0.13);
  g.fillStyle = "#8f918c";
  g.fill();
  outline(g, 0.02);
  g.fillStyle = "#6b6d68";
  g.fillRect(-0.016, -0.38, 0.032, 0.2);
  g.fillRect(-0.065, -0.32, 0.13, 0.032);
}

// ---------------------------------------------------------------------------
// Monstros
// ---------------------------------------------------------------------------

export function drawMonster(g: Ctx, def: MonsterDef, pose: Pose, options: { evade: boolean }): void {
  g.save();
  if (options.evade) g.globalAlpha *= 0.55;
  switch (def.shape) {
    case "slime":
      drawSlime(g, def, pose);
      break;
    case "rabbit":
      drawRabbit(g, def, pose);
      break;
    case "wolf":
      drawWolf(g, def, pose);
      break;
    case "goblin":
      drawGoblin(g, def, pose);
      break;
    case "skeleton":
      drawSkeleton(g, def, pose);
      break;
    case "golem":
      drawGolem(g, def, pose);
      break;
    case "ogre":
      drawOgre(g, def, pose);
      break;
  }
  g.restore();
}

function drawSlime(g: Ctx, def: MonsterDef, pose: Pose): void {
  const r = def.size;
  const t = pose.time * 0.005 + pose.seed;
  const squish = Math.sin(t * (pose.moving ? 2.4 : 1.1)) * 0.08;
  const w = r * (1 + squish);
  const h = r * (0.9 - squish);
  groundShadow(g, r * 0.95);
  g.beginPath();
  g.moveTo(-w, -0.02);
  g.quadraticCurveTo(-w * 1.05, -h * 1.35, 0, -h * 1.4);
  g.quadraticCurveTo(w * 1.05, -h * 1.35, w, -0.02);
  g.quadraticCurveTo(0, 0.05, -w, -0.02);
  const grad = g.createRadialGradient(-w * 0.3, -h, 0, 0, -h * 0.6, w * 1.4);
  grad.addColorStop(0, shade(def.color, 0.45));
  grad.addColorStop(0.55, def.color);
  grad.addColorStop(1, shade(def.color, -0.4));
  g.fillStyle = grad;
  g.fill();
  outline(g, 0.022, "rgba(20, 50, 30, 0.5)");
  ellipse(g, -w * 0.38, -h * 1.0, w * 0.22, h * 0.12, "rgba(255,255,255,0.55)", -0.5);
  const ex = Math.cos(pose.facing) * w * 0.14;
  for (const side of [-0.3, 0.28]) {
    circle(g, w * side + ex, -h * 0.62, w * 0.12, INK);
    circle(g, w * side + ex - w * 0.035, -h * 0.67, w * 0.045, "#ffffff");
  }
  hitFlash(g, pose, -w, -h * 1.4, w * 2, h * 1.4);
}

function drawRabbit(g: Ctx, def: MonsterDef, pose: Pose): void {
  const r = def.size;
  const hop = pose.moving ? Math.abs(Math.sin(pose.time * 0.012 + pose.seed)) * r * 0.35 : 0;
  groundShadow(g, r * 0.8 * (1 - hop));
  g.save();
  g.scale(facingFlip(pose.facing), 1);
  g.translate(0, -hop);
  circle(g, -r * 0.7, -r * 0.6, r * 0.2, "#ffffff");
  ellipse(g, 0, -r * 0.58, r * 0.78, r * 0.58, def.color);
  outline(g, 0.02);
  ellipse(g, r * 0.12, -r * 1.95, r * 0.13, r * 0.42, def.color, -0.25);
  outline(g, 0.018);
  ellipse(g, r * 0.12, -r * 1.95, r * 0.06, r * 0.3, "#f2b8c0", -0.25);
  ellipse(g, r * 0.5, -r * 1.9, r * 0.13, r * 0.42, def.color, 0.28);
  outline(g, 0.018);
  ellipse(g, r * 0.5, -r * 1.9, r * 0.06, r * 0.3, "#f2b8c0", 0.28);
  circle(g, r * 0.36, -r * 1.22, r * 0.44, def.color);
  outline(g, 0.02);
  g.beginPath();
  g.moveTo(r * 0.36, -r * 1.58);
  g.lineTo(r * 0.5, -r * 2.05);
  g.lineTo(r * 0.58, -r * 1.55);
  g.closePath();
  g.fillStyle = "#e3c27a";
  g.fill();
  outline(g, 0.012);
  circle(g, r * 0.55, -r * 1.28, r * 0.07, INK);
  circle(g, r * 0.78, -r * 1.12, r * 0.06, "#e58a9a");
  hitFlash(g, pose, -r * 0.8, -r * 1.7, r * 1.7, r * 1.7);
  g.restore();
}

function drawWolf(g: Ctx, def: MonsterDef, pose: Pose): void {
  const r = def.size;
  const step = pose.moving ? Math.sin(pose.time * 0.02 + pose.seed) : 0;
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * r * 0.25 : 0;
  groundShadow(g, r * 1.05);
  g.save();
  g.scale(facingFlip(pose.facing), 1);
  g.translate(lunge, 0);
  const leg = "#5d6577";
  line(g, -r * 0.55, -r * 0.5, -r * 0.55 - step * r * 0.18, 0, leg, 0.05);
  line(g, -r * 0.3, -r * 0.5, -r * 0.3 + step * r * 0.18, 0, leg, 0.05);
  line(g, r * 0.35, -r * 0.5, r * 0.35 + step * r * 0.18, 0, leg, 0.05);
  line(g, r * 0.6, -r * 0.5, r * 0.6 - step * r * 0.18, 0, leg, 0.05);
  g.beginPath();
  g.moveTo(-r * 0.85, -r * 0.85);
  g.quadraticCurveTo(-r * 1.35, -r * (1.15 + Math.sin(pose.time * 0.008) * 0.12), -r * 1.45, -r * 1.35);
  g.strokeStyle = shade(def.color, -0.2);
  g.lineWidth = 0.08;
  g.lineCap = "round";
  g.stroke();
  ellipse(g, 0, -r * 0.78, r * 0.95, r * 0.42, def.color);
  outline(g, 0.022);
  ellipse(g, -r * 0.1, -r * 0.98, r * 0.68, r * 0.16, shade(def.color, -0.22));
  circle(g, r * 0.88, -r * 1.08, r * 0.36, def.color);
  outline(g, 0.02);
  ellipse(g, r * 1.2, -r * 0.98, r * 0.24, r * 0.14, shade(def.color, 0.15));
  circle(g, r * 1.42, -r * 1.0, r * 0.06, INK);
  g.beginPath();
  g.moveTo(r * 0.68, -r * 1.3);
  g.lineTo(r * 0.78, -r * 1.68);
  g.lineTo(r * 0.94, -r * 1.36);
  g.closePath();
  g.fillStyle = shade(def.color, -0.15);
  g.fill();
  outline(g, 0.015);
  circle(g, r * 1.02, -r * 1.14, r * 0.07, "#f5d142");
  circle(g, r * 1.04, -r * 1.14, r * 0.032, INK);
  hitFlash(g, pose, -r, -r * 1.45, r * 2.3, r * 1.4);
  g.restore();
}

function drawHumanoidBase(
  g: Ctx,
  pose: Pose,
  colors: { legs: string; body: string; arms: string },
): { step: number } {
  const step = pose.moving ? Math.sin(pose.time * 0.016 + pose.seed) : 0;
  fillRoundRect(g, -0.1, -0.21 + step * 0.03, 0.08, 0.21, 0.03, colors.legs);
  fillRoundRect(g, 0.02, -0.21 - step * 0.03, 0.08, 0.21, 0.03, colors.legs);
  roundRect(g, -0.15, -0.48, 0.3, 0.31, 0.08);
  g.fillStyle = colors.body;
  g.fill();
  outline(g, 0.022);
  ellipse(g, -0.18, -0.34, 0.05, 0.1, colors.arms);
  ellipse(g, 0.18, -0.34, 0.05, 0.1, colors.arms);
  return { step };
}

function drawGoblin(g: Ctx, def: MonsterDef, pose: Pose): void {
  const s = def.size / 0.38;
  groundShadow(g, 0.2 * s);
  g.save();
  g.scale(facingFlip(pose.facing) * s * 0.9, s * 0.9);
  drawHumanoidBase(g, pose, { legs: "#3d2f1f", body: "#6b4f2e", arms: def.color });
  const skin = def.color;
  g.beginPath();
  g.moveTo(-0.1, -0.62);
  g.lineTo(-0.32, -0.7);
  g.lineTo(-0.1, -0.55);
  g.moveTo(0.1, -0.62);
  g.lineTo(0.32, -0.72);
  g.lineTo(0.1, -0.55);
  g.fillStyle = shade(skin, -0.1);
  g.fill();
  circle(g, 0, -0.6, 0.15, skin);
  outline(g, 0.02);
  circle(g, 0.03, -0.62, 0.028, "#f6e05e");
  circle(g, 0.1, -0.62, 0.028, "#f6e05e");
  circle(g, 0.035, -0.62, 0.012, "#a3261b");
  circle(g, 0.105, -0.62, 0.012, "#a3261b");
  line(g, 0.0, -0.53, 0.12, -0.54, INK, 0.015);
  const swing = pose.attack >= 0 ? -1.2 + 2.2 * easeOut(pose.attack) : -0.3;
  g.save();
  g.translate(0.19, -0.33);
  g.rotate(swing);
  fillRoundRect(g, -0.018, -0.22, 0.036, 0.2, 0.01, "#c9ccd1");
  g.fillStyle = "#5b3a22";
  g.fillRect(-0.04, -0.03, 0.08, 0.03);
  g.restore();
  hitFlash(g, pose, -0.17, -0.76, 0.34, 0.76);
  g.restore();
}

function drawSkeleton(g: Ctx, def: MonsterDef, pose: Pose): void {
  const s = def.size / 0.4;
  const bone = def.color;
  groundShadow(g, 0.2 * s);
  g.save();
  g.scale(facingFlip(pose.facing) * s, s);
  const step = pose.moving ? Math.sin(pose.time * 0.014 + pose.seed) : 0;
  line(g, -0.06, -0.22, -0.07 + step * 0.04, 0, bone, 0.035);
  line(g, 0.06, -0.22, 0.07 - step * 0.04, 0, bone, 0.035);
  ellipse(g, 0, -0.24, 0.1, 0.04, bone);
  line(g, 0, -0.26, 0, -0.5, bone, 0.03);
  for (let i = 0; i < 3; i++) {
    const y = -0.48 + i * 0.065;
    g.beginPath();
    g.ellipse(0, y, 0.13 - i * 0.015, 0.03, 0, Math.PI, TAU);
    g.strokeStyle = bone;
    g.lineWidth = 0.025;
    g.stroke();
  }
  line(g, -0.15, -0.48, -0.2, -0.26, bone, 0.03);
  const swing = pose.attack >= 0 ? -1.4 + 2.4 * easeOut(pose.attack) : -0.5;
  line(g, 0.15, -0.48, 0.2, -0.3, bone, 0.03);
  g.save();
  g.translate(0.2, -0.3);
  g.rotate(swing);
  fillRoundRect(g, -0.02, -0.38, 0.04, 0.34, 0.01, "#9c7b5a");
  g.fillStyle = "#4a3b2a";
  g.fillRect(-0.06, -0.05, 0.12, 0.03);
  g.restore();
  circle(g, 0, -0.64, 0.14, bone);
  outline(g, 0.018);
  fillRoundRect(g, -0.07, -0.55, 0.14, 0.06, 0.02, shade(bone, -0.08));
  circle(g, -0.045, -0.65, 0.04, "#1d1712");
  circle(g, 0.05, -0.65, 0.04, "#1d1712");
  circle(g, -0.045, -0.65, 0.014, "#ff6b4a");
  circle(g, 0.05, -0.65, 0.014, "#ff6b4a");
  hitFlash(g, pose, -0.17, -0.8, 0.34, 0.8);
  g.restore();
}

function drawGolem(g: Ctx, def: MonsterDef, pose: Pose): void {
  const s = def.size / 0.52;
  const stone = def.color;
  const heave = Math.sin(pose.time * 0.004 + pose.seed) * 0.015;
  const slam = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 0.12 : 0;
  groundShadow(g, 0.45 * s);
  g.save();
  g.scale(facingFlip(pose.facing) * s, s);
  fillRoundRect(g, -0.26, -0.24, 0.2, 0.24, 0.05, shade(stone, -0.25));
  fillRoundRect(g, 0.06, -0.24, 0.2, 0.24, 0.05, shade(stone, -0.25));
  roundRect(g, -0.34, -0.84 + heave, 0.68, 0.64, 0.14);
  const grad = g.createLinearGradient(0, -0.84, 0, -0.2);
  grad.addColorStop(0, shade(stone, 0.2));
  grad.addColorStop(1, shade(stone, -0.3));
  g.fillStyle = grad;
  g.fill();
  outline(g, 0.03);
  g.beginPath();
  g.moveTo(-0.1, -0.78 + heave);
  g.lineTo(-0.02, -0.6);
  g.lineTo(-0.12, -0.48);
  g.moveTo(0.18, -0.7);
  g.lineTo(0.1, -0.55);
  g.strokeStyle = shade(stone, -0.45);
  g.lineWidth = 0.02;
  g.stroke();
  ellipse(g, -0.22, -0.8 + heave, 0.12, 0.05, "#6f8f4a");
  ellipse(g, 0.2, -0.82 + heave, 0.09, 0.04, "#6f8f4a");
  fillRoundRect(g, -0.17, -1.06 + heave, 0.34, 0.26, 0.07, shade(stone, 0.05));
  outline(g, 0.025);
  for (const ex of [-0.065, 0.075]) {
    const glow = g.createRadialGradient(ex, -0.94 + heave, 0, ex, -0.94 + heave, 0.09);
    glow.addColorStop(0, "rgba(255, 191, 90, 0.9)");
    glow.addColorStop(1, "rgba(255, 191, 90, 0)");
    g.fillStyle = glow;
    g.fillRect(ex - 0.09, -1.03 + heave, 0.18, 0.18);
  }
  g.fillStyle = "#ffd27a";
  g.fillRect(-0.1, -0.96 + heave, 0.07, 0.035);
  g.fillRect(0.04, -0.96 + heave, 0.07, 0.035);
  circle(g, -0.4, -0.42 + slam, 0.13, shade(stone, -0.1));
  outline(g, 0.022);
  circle(g, 0.4, -0.42 + slam, 0.13, shade(stone, -0.1));
  outline(g, 0.022);
  hitFlash(g, pose, -0.36, -1.08, 0.72, 1.08);
  g.restore();
}

function drawOgre(g: Ctx, def: MonsterDef, pose: Pose): void {
  const s = def.size / 0.82;
  const skin = def.color;
  const pulse = 0.5 + 0.5 * Math.sin(pose.time * 0.004);
  g.save();
  g.beginPath();
  g.ellipse(0, 0, 0.78 * s, 0.32 * s, 0, 0, TAU);
  g.strokeStyle = `rgba(232, 90, 60, ${0.35 + pulse * 0.3})`;
  g.lineWidth = 0.05;
  g.stroke();
  g.restore();
  groundShadow(g, 0.6 * s, 0.32);
  g.save();
  g.scale(facingFlip(pose.facing) * s, s);
  const step = pose.moving ? Math.sin(pose.time * 0.01 + pose.seed) : 0;
  fillRoundRect(g, -0.3, -0.36 + step * 0.04, 0.2, 0.36, 0.08, shade(skin, -0.2));
  fillRoundRect(g, 0.1, -0.36 - step * 0.04, 0.2, 0.36, 0.08, shade(skin, -0.2));
  ellipse(g, 0, -0.78, 0.5, 0.48, skin);
  outline(g, 0.03);
  ellipse(g, 0.04, -0.68, 0.32, 0.3, shade(skin, 0.18));
  fillRoundRect(g, -0.42, -0.42, 0.84, 0.14, 0.05, "#6b4426");
  ellipse(g, -0.5, -0.82, 0.13, 0.26, shade(skin, -0.08), 0.3);
  outline(g, 0.022);
  circle(g, 0, -1.32, 0.25, skin);
  outline(g, 0.025);
  fillRoundRect(g, -0.17, -1.42, 0.34, 0.06, 0.03, shade(skin, -0.35));
  circle(g, -0.07, -1.35, 0.03, "#ff4d3a");
  circle(g, 0.08, -1.35, 0.03, "#ff4d3a");
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * 0.1, -1.18);
    g.lineTo(side * 0.14, -1.3);
    g.lineTo(side * 0.06, -1.2);
    g.closePath();
    g.fillStyle = "#f4ecd8";
    g.fill();
  }
  g.beginPath();
  g.moveTo(-0.18, -1.52);
  for (let i = 0; i <= 4; i++) {
    const x = -0.18 + i * 0.09;
    g.lineTo(x, i % 2 === 0 ? -1.52 : -1.66);
  }
  g.lineTo(0.18, -1.48);
  g.lineTo(-0.18, -1.48);
  g.closePath();
  g.fillStyle = "#e6be4f";
  g.fill();
  outline(g, 0.015);
  const swing = pose.attack >= 0 ? -1.6 + 2.6 * easeOut(pose.attack) : -0.4;
  g.save();
  g.translate(0.5, -0.82);
  g.rotate(swing);
  roundRect(g, -0.07, -0.78, 0.14, 0.78, 0.07);
  g.fillStyle = "#7a5230";
  g.fill();
  outline(g, 0.022);
  for (let i = 0; i < 3; i++) circle(g, i % 2 === 0 ? -0.07 : 0.07, -0.66 + i * 0.12, 0.03, "#d8d2c4");
  g.restore();
  ellipse(g, 0.5, -0.82, 0.13, 0.26, shade(skin, -0.08), -0.3);
  outline(g, 0.022);
  hitFlash(g, pose, -0.52, -1.6, 1.04, 1.6);
  g.restore();
}

// ---------------------------------------------------------------------------
// Itens e ícones (centrados na origem, cabem num quadrado de lado 1)
// ---------------------------------------------------------------------------

const RARITY_TINT: Record<Rarity, string> = {
  comum: "#8a5a36",
  incomum: "#9aa3ad",
  raro: "#5b8fd6",
  epico: "#7b55c9",
};

export function drawItemIcon(g: Ctx, icon: ItemIcon, rarity: Rarity): void {
  switch (icon) {
    case "gold":
      for (const [x, y] of [
        [-0.15, 0.12],
        [0.15, 0.14],
        [0, -0.07],
      ] as const) {
        const grad = g.createRadialGradient(x - 0.05, y - 0.05, 0, x, y, 0.18);
        grad.addColorStop(0, "#fff1a8");
        grad.addColorStop(0.5, "#e8b931");
        grad.addColorStop(1, "#a97a12");
        g.beginPath();
        g.arc(x, y, 0.17, 0, TAU);
        g.fillStyle = grad;
        g.fill();
        outline(g, 0.025, "rgba(110, 70, 10, 0.8)");
        g.beginPath();
        g.arc(x, y, 0.1, 0, TAU);
        g.strokeStyle = "rgba(140, 95, 20, 0.6)";
        g.lineWidth = 0.02;
        g.stroke();
      }
      return;
    case "potion-red":
    case "potion-red-big":
    case "potion-blue": {
      const big = icon === "potion-red-big";
      const liquid = icon === "potion-blue" ? "#3c7ad8" : "#d63a3a";
      const r = big ? 0.3 : 0.25;
      const cy = 0.14;
      fillRoundRect(g, -0.075, cy - r - 0.2, 0.15, 0.24, 0.03, "rgba(220, 235, 240, 0.85)");
      fillRoundRect(g, -0.095, cy - r - 0.28, 0.19, 0.1, 0.03, "#a5743f");
      g.save();
      g.beginPath();
      g.arc(0, cy, r, 0, TAU);
      g.fillStyle = "rgba(225, 238, 242, 0.35)";
      g.fill();
      g.clip();
      const grad = g.createLinearGradient(0, cy - r * 0.2, 0, cy + r);
      grad.addColorStop(0, shade(liquid, 0.25));
      grad.addColorStop(1, shade(liquid, -0.35));
      g.fillStyle = grad;
      g.fillRect(-r, cy - r * 0.25, r * 2, r * 1.3);
      g.restore();
      g.beginPath();
      g.arc(0, cy, r, 0, TAU);
      outline(g, 0.03, "rgba(255, 255, 255, 0.75)");
      g.beginPath();
      g.arc(-r * 0.15, cy - r * 0.1, r * 0.6, Math.PI * 1.1, Math.PI * 1.45);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 0.035;
      g.lineCap = "round";
      g.stroke();
      if (big) circle(g, r * 0.55, cy - r * 0.95, 0.04, "#fff4c2");
      return;
    }
    case "sword": {
      g.save();
      g.rotate(Math.PI / 4);
      roundRect(g, -0.055, -0.46, 0.11, 0.6, 0.03);
      const grad = g.createLinearGradient(-0.055, 0, 0.055, 0);
      grad.addColorStop(0, "#f4f6f8");
      grad.addColorStop(1, "#9aa3ad");
      g.fillStyle = grad;
      g.fill();
      outline(g, 0.02);
      fillRoundRect(g, -0.17, 0.12, 0.34, 0.07, 0.03, "#c9a24b");
      fillRoundRect(g, -0.035, 0.18, 0.07, 0.17, 0.02, "#5b3a22");
      circle(g, 0, 0.38, 0.055, RARITY_TINT[rarity]);
      g.restore();
      return;
    }
    case "bow": {
      g.save();
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.arc(-0.1, 0, 0.4, -1.1, 1.1);
      g.strokeStyle = rarity === "epico" ? "#d8b8ff" : "#8a5a2b";
      g.lineWidth = 0.07;
      g.lineCap = "round";
      g.stroke();
      const ex = -0.1 + Math.cos(1.1) * 0.4;
      const ey = Math.sin(1.1) * 0.4;
      line(g, ex, -ey, ex, ey, "#efe6d6", 0.02);
      line(g, ex - 0.02, 0, 0.42, 0, "#d9c7a0", 0.03);
      g.beginPath();
      g.moveTo(0.46, 0);
      g.lineTo(0.36, -0.05);
      g.lineTo(0.36, 0.05);
      g.closePath();
      g.fillStyle = "#c9ccd1";
      g.fill();
      g.restore();
      return;
    }
    case "staff": {
      g.save();
      g.rotate(Math.PI / 4);
      line(g, 0, 0.42, 0, -0.26, "#6b4a2b", 0.07);
      const tint = RARITY_TINT[rarity];
      const halo = g.createRadialGradient(0, -0.33, 0, 0, -0.33, 0.2);
      halo.addColorStop(0, alpha(rarity === "comum" ? "#9fd3ff" : tint, 0.9));
      halo.addColorStop(1, alpha(rarity === "comum" ? "#9fd3ff" : tint, 0));
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, -0.33, 0.2, 0, TAU);
      g.fill();
      circle(g, 0, -0.33, 0.09, rarity === "comum" ? "#9fd3ff" : tint);
      circle(g, -0.03, -0.36, 0.03, "#ffffff");
      g.restore();
      return;
    }
    case "armor": {
      const base = RARITY_TINT[rarity];
      g.beginPath();
      g.moveTo(-0.36, -0.22);
      g.lineTo(-0.16, -0.36);
      g.quadraticCurveTo(0, -0.26, 0.16, -0.36);
      g.lineTo(0.36, -0.22);
      g.lineTo(0.28, -0.04);
      g.lineTo(0.22, -0.08);
      g.lineTo(0.22, 0.36);
      g.lineTo(-0.22, 0.36);
      g.lineTo(-0.22, -0.08);
      g.lineTo(-0.28, -0.04);
      g.closePath();
      const grad = g.createLinearGradient(0, -0.36, 0, 0.36);
      grad.addColorStop(0, shade(base, 0.25));
      grad.addColorStop(1, shade(base, -0.3));
      g.fillStyle = grad;
      g.fill();
      outline(g, 0.025);
      line(g, 0, -0.24, 0, 0.32, shade(base, -0.4), 0.02);
      if (rarity === "epico") {
        g.beginPath();
        g.moveTo(-0.22, 0.2);
        g.lineTo(0.22, 0.2);
        g.strokeStyle = "#e6be4f";
        g.lineWidth = 0.035;
        g.stroke();
      }
      return;
    }
  }
}

/** Ícones das habilidades na barra de ações. */
export function drawSkillIcon(g: Ctx, effect: SkillEffect, color: string): void {
  if (effect === "slash") {
    g.beginPath();
    g.arc(-0.12, 0.12, 0.4, -1.35, 0.25);
    g.strokeStyle = "#ffe7b0";
    g.lineWidth = 0.09;
    g.lineCap = "round";
    g.stroke();
    g.beginPath();
    g.arc(-0.12, 0.12, 0.28, -1.2, 0.1);
    g.strokeStyle = alpha(color, 0.9);
    g.lineWidth = 0.05;
    g.stroke();
    return;
  }
  if (effect === "arrows") {
    for (const [x, y] of [
      [-0.22, -0.1],
      [0.02, -0.2],
      [0.24, -0.05],
    ] as const) {
      line(g, x - 0.12, y - 0.24, x + 0.06, y + 0.24, "#e9dcc0", 0.04);
      g.beginPath();
      g.moveTo(x + 0.09, y + 0.32);
      g.lineTo(x + 0.01, y + 0.2);
      g.lineTo(x + 0.11, y + 0.18);
      g.closePath();
      g.fillStyle = "#c9ccd1";
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 0.3, 0.36, 0.08, 0, 0, TAU);
    g.strokeStyle = alpha(color, 0.9);
    g.lineWidth = 0.035;
    g.stroke();
    return;
  }
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 0.42);
  halo.addColorStop(0, "rgba(255,255,255,0.95)");
  halo.addColorStop(0.35, alpha(color, 0.85));
  halo.addColorStop(1, alpha(color, 0));
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, 0.42, 0, TAU);
  g.fill();
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    const radius = i % 2 === 0 ? 0.36 : 0.14;
    g.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  g.closePath();
  g.fillStyle = "#f3e9ff";
  g.fill();
}

export function drawBagIcon(g: Ctx): void {
  g.beginPath();
  g.moveTo(-0.28, -0.05);
  g.quadraticCurveTo(-0.36, 0.36, 0, 0.36);
  g.quadraticCurveTo(0.36, 0.36, 0.28, -0.05);
  g.quadraticCurveTo(0.14, -0.2, 0.1, -0.24);
  g.lineTo(-0.1, -0.24);
  g.quadraticCurveTo(-0.14, -0.2, -0.28, -0.05);
  g.closePath();
  const grad = g.createLinearGradient(0, -0.24, 0, 0.36);
  grad.addColorStop(0, "#b98a52");
  grad.addColorStop(1, "#6e4a27");
  g.fillStyle = grad;
  g.fill();
  outline(g, 0.025);
  fillRoundRect(g, -0.14, -0.33, 0.28, 0.1, 0.04, "#8c6236");
  line(g, -0.12, -0.24, 0.12, -0.24, "#d2a751", 0.04);
}
