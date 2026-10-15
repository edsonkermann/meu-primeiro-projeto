import { MAX_LEVEL } from "./constants";
import type { ClassDef } from "./data/classes";
import { ITEMS } from "./data/items";

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  attackRange: number;
  attackIntervalMs: number;
  moveSpeed: number;
  critChance: number;
}

export interface EquipmentState {
  weapon: string | null;
  armor: string | null;
}

/** Experiência necessária para sair do nível atual. No nível máximo retorna 0. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round(30 * Math.pow(level, 1.8) + 30);
}

/** Atributos finais: base da classe + crescimento por nível + bônus dos equipamentos. */
export function computeStats(cls: ClassDef, level: number, equipment: EquipmentState): DerivedStats {
  const growth = level - 1;
  const stats = {
    maxHp: cls.base.maxHp + cls.perLevel.maxHp * growth,
    maxMp: cls.base.maxMp + cls.perLevel.maxMp * growth,
    attackMin: cls.base.attackMin + cls.perLevel.attackMin * growth,
    attackMax: cls.base.attackMax + cls.perLevel.attackMax * growth,
    defense: cls.base.defense + cls.perLevel.defense * growth,
    critChance: cls.critChance,
  };
  for (const itemId of [equipment.weapon, equipment.armor]) {
    const bonus = itemId ? ITEMS[itemId]?.bonus : undefined;
    if (!bonus) continue;
    stats.maxHp += bonus.maxHp ?? 0;
    stats.maxMp += bonus.maxMp ?? 0;
    stats.attackMin += bonus.attackMin ?? 0;
    stats.attackMax += bonus.attackMax ?? 0;
    stats.defense += bonus.defense ?? 0;
    stats.critChance += bonus.critChance ?? 0;
  }
  const attackMin = Math.round(stats.attackMin);
  return {
    maxHp: Math.round(stats.maxHp),
    maxMp: Math.round(stats.maxMp),
    attackMin,
    attackMax: Math.max(attackMin, Math.round(stats.attackMax)),
    defense: Math.round(stats.defense),
    attackRange: cls.attackRange,
    attackIntervalMs: cls.attackIntervalMs,
    moveSpeed: cls.moveSpeed,
    critChance: Math.min(0.5, stats.critChance),
  };
}

/**
 * Ajuste de experiência pela diferença de nível: monstros mais fortes dão bônus,
 * monstros muito mais fracos dão quase nada (evita "farmar" o mapa inicial).
 */
export function xpMultiplier(playerLevel: number, monsterLevel: number): number {
  const diff = monsterLevel - playerLevel;
  if (diff >= 0) return Math.min(1.5, 1 + diff * 0.1);
  if (diff >= -2) return 1;
  return Math.max(0.1, 1 + (diff + 2) * 0.2);
}

/** Redução de dano pela defesa, com retornos decrescentes. Todo golpe causa ao menos 1. */
export function mitigate(rawDamage: number, defense: number): number {
  return Math.max(1, Math.round(rawDamage * (60 / (60 + Math.max(0, defense)))));
}
