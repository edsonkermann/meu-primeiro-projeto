/**
 * Classes jogáveis. Todo o balanceamento fica em dados: dá para ajustar
 * números sem mexer na lógica do servidor.
 */

export type ClassId = "guerreiro" | "arqueira" | "mago";
export const CLASS_IDS: readonly ClassId[] = ["guerreiro", "arqueira", "mago"];

export interface BaseStats {
  maxHp: number;
  maxMp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
}

/** Como o ataque básico aparece na tela. */
export type AttackStyle = "melee" | "arrow" | "orb";
export type SkillEffect = "slash" | "arrows" | "arcane";

export interface SkillDef {
  name: string;
  description: string;
  mpCost: number;
  cooldownMs: number;
  range: number;
  /** Multiplicador sobre o dano do ataque básico. */
  multiplier: number;
  /** 0 = alvo único; maior que 0 = atinge todos os monstros nesse raio ao redor do alvo. */
  radius: number;
  effect: SkillEffect;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  color: string;
  accent: string;
  base: BaseStats;
  perLevel: BaseStats;
  attackRange: number;
  attackIntervalMs: number;
  /** Tiles por segundo. */
  moveSpeed: number;
  critChance: number;
  attackStyle: AttackStyle;
  skill: SkillDef;
  starterItems: readonly { item: string; qty: number }[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  guerreiro: {
    id: "guerreiro",
    name: "Guerreiro",
    tagline: "A muralha da linha de frente",
    description: "Luta corpo a corpo, com muita vida e defesa. Aguenta o tranco enquanto os monstros se amontoam.",
    color: "#c2453a",
    accent: "#f2b544",
    base: { maxHp: 130, maxMp: 30, attackMin: 9, attackMax: 13, defense: 9 },
    perLevel: { maxHp: 20, maxMp: 3, attackMin: 2.2, attackMax: 2.8, defense: 2 },
    attackRange: 1.4,
    attackIntervalMs: 900,
    moveSpeed: 4.6,
    critChance: 0.05,
    attackStyle: "melee",
    skill: {
      name: "Golpe Devastador",
      description: "Um golpe pesado que causa 230% de dano ao alvo.",
      mpCost: 10,
      cooldownMs: 5000,
      range: 1.6,
      multiplier: 2.3,
      radius: 0,
      effect: "slash",
    },
    starterItems: [{ item: "pocao_vida_p", qty: 5 }],
  },
  arqueira: {
    id: "arqueira",
    name: "Arqueira",
    tagline: "Precisão a longa distância",
    description: "Ataca de longe e se move rápido. Mantenha distância e os monstros nem chegam perto.",
    color: "#2f9e5b",
    accent: "#b9f0c9",
    base: { maxHp: 95, maxMp: 40, attackMin: 7, attackMax: 11, defense: 5 },
    perLevel: { maxHp: 13, maxMp: 4, attackMin: 2, attackMax: 2.6, defense: 1.2 },
    attackRange: 6,
    attackIntervalMs: 800,
    moveSpeed: 4.9,
    critChance: 0.1,
    attackStyle: "arrow",
    skill: {
      name: "Chuva de Flechas",
      description: "Uma saraivada de flechas atinge todos os inimigos numa área, com 140% de dano.",
      mpCost: 16,
      cooldownMs: 7000,
      range: 6.5,
      multiplier: 1.4,
      radius: 2.2,
      effect: "arrows",
    },
    starterItems: [{ item: "pocao_vida_p", qty: 5 }],
  },
  mago: {
    id: "mago",
    name: "Mago",
    tagline: "Poder arcano devastador",
    description: "Pouca vida, mas o maior dano do jogo. Suas explosões limpam grupos inteiros de monstros.",
    color: "#5b5bd6",
    accent: "#d6b4fc",
    base: { maxHp: 80, maxMp: 60, attackMin: 12, attackMax: 17, defense: 3 },
    perLevel: { maxHp: 10, maxMp: 7, attackMin: 2.8, attackMax: 3.6, defense: 0.8 },
    attackRange: 5,
    attackIntervalMs: 1150,
    moveSpeed: 4.6,
    critChance: 0.07,
    attackStyle: "orb",
    skill: {
      name: "Explosão Arcana",
      description: "Energia arcana explode no alvo e atinge os inimigos próximos com 190% de dano.",
      mpCost: 18,
      cooldownMs: 5500,
      range: 5.5,
      multiplier: 1.9,
      radius: 1.8,
      effect: "arcane",
    },
    starterItems: [
      { item: "pocao_vida_p", qty: 5 },
      { item: "pocao_mana", qty: 2 },
    ],
  },
};
