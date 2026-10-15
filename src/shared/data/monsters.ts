/**
 * Monstros e tabelas de drop. Itens "equip:N" viram uma arma da classe de quem
 * ganhou o loot ou uma armadura daquela faixa (loot pessoal).
 */

export type MonsterId = "gosma" | "coelho" | "lobo" | "goblin" | "esqueleto" | "golem" | "ogro";
export type MonsterShape = "slime" | "rabbit" | "wolf" | "goblin" | "skeleton" | "golem" | "ogre";

export interface DropEntry {
  item: string;
  chance: number;
  min?: number;
  max?: number;
}

export interface DropTable {
  gold: { chance: number; min: number; max: number };
  items: readonly DropEntry[];
}

export interface MonsterDef {
  id: MonsterId;
  name: string;
  level: number;
  maxHp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  attackRange: number;
  attackIntervalMs: number;
  moveSpeed: number;
  /** 0 = passivo: só reage quando é atacado. */
  aggroRadius: number;
  /** Distância máxima do ponto de nascimento antes de desistir e voltar. */
  leashRadius: number;
  wanderRadius: number;
  respawnMs: number;
  xp: number;
  boss: boolean;
  shape: MonsterShape;
  color: string;
  /** Raio visual (e de clique) em tiles. */
  size: number;
  drops: DropTable;
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  gosma: {
    id: "gosma",
    name: "Gosma Verde",
    level: 1,
    maxHp: 42,
    attackMin: 3,
    attackMax: 5,
    defense: 0,
    attackRange: 1.1,
    attackIntervalMs: 1500,
    moveSpeed: 2.2,
    aggroRadius: 0,
    leashRadius: 10,
    wanderRadius: 3,
    respawnMs: 12_000,
    xp: 12,
    boss: false,
    shape: "slime",
    color: "#62d48a",
    size: 0.36,
    drops: {
      gold: { chance: 0.85, min: 1, max: 4 },
      items: [
        { item: "pocao_vida_p", chance: 0.22 },
        { item: "equip:1", chance: 0.035 },
      ],
    },
  },
  coelho: {
    id: "coelho",
    name: "Coelho Chifrudo",
    level: 2,
    maxHp: 62,
    attackMin: 4,
    attackMax: 7,
    defense: 2,
    attackRange: 1.1,
    attackIntervalMs: 1250,
    moveSpeed: 3.2,
    aggroRadius: 0,
    leashRadius: 11,
    wanderRadius: 4,
    respawnMs: 12_000,
    xp: 18,
    boss: false,
    shape: "rabbit",
    color: "#efe4d6",
    size: 0.34,
    drops: {
      gold: { chance: 0.85, min: 2, max: 5 },
      items: [
        { item: "pocao_vida_p", chance: 0.22 },
        { item: "pocao_mana", chance: 0.08 },
        { item: "equip:1", chance: 0.04 },
      ],
    },
  },
  lobo: {
    id: "lobo",
    name: "Lobo Cinzento",
    level: 4,
    maxHp: 115,
    attackMin: 8,
    attackMax: 12,
    defense: 5,
    attackRange: 1.2,
    attackIntervalMs: 1200,
    moveSpeed: 4.0,
    aggroRadius: 5,
    leashRadius: 12,
    wanderRadius: 4,
    respawnMs: 15_000,
    xp: 40,
    boss: false,
    shape: "wolf",
    color: "#8f99ad",
    size: 0.42,
    drops: {
      gold: { chance: 0.9, min: 4, max: 11 },
      items: [
        { item: "pocao_vida_p", chance: 0.25 },
        { item: "pocao_vida", chance: 0.08 },
        { item: "pocao_mana", chance: 0.12 },
        { item: "equip:1", chance: 0.04 },
        { item: "equip:2", chance: 0.025 },
      ],
    },
  },
  goblin: {
    id: "goblin",
    name: "Goblin Saqueador",
    level: 6,
    maxHp: 165,
    attackMin: 11,
    attackMax: 16,
    defense: 8,
    attackRange: 1.2,
    attackIntervalMs: 1300,
    moveSpeed: 3.7,
    aggroRadius: 6,
    leashRadius: 12,
    wanderRadius: 4,
    respawnMs: 15_000,
    xp: 62,
    boss: false,
    shape: "goblin",
    color: "#7cc46a",
    size: 0.38,
    drops: {
      gold: { chance: 0.95, min: 6, max: 15 },
      items: [
        { item: "pocao_vida_p", chance: 0.2 },
        { item: "pocao_vida", chance: 0.12 },
        { item: "pocao_mana", chance: 0.15 },
        { item: "equip:2", chance: 0.035 },
      ],
    },
  },
  esqueleto: {
    id: "esqueleto",
    name: "Esqueleto Errante",
    level: 9,
    maxHp: 270,
    attackMin: 16,
    attackMax: 23,
    defense: 14,
    attackRange: 1.3,
    attackIntervalMs: 1400,
    moveSpeed: 3.4,
    aggroRadius: 6,
    leashRadius: 13,
    wanderRadius: 4,
    respawnMs: 18_000,
    xp: 115,
    boss: false,
    shape: "skeleton",
    color: "#ebe3cf",
    size: 0.4,
    drops: {
      gold: { chance: 0.95, min: 10, max: 26 },
      items: [
        { item: "pocao_vida", chance: 0.22 },
        { item: "pocao_mana", chance: 0.18 },
        { item: "equip:2", chance: 0.05 },
        { item: "equip:3", chance: 0.012 },
      ],
    },
  },
  golem: {
    id: "golem",
    name: "Golem de Pedra",
    level: 11,
    maxHp: 480,
    attackMin: 22,
    attackMax: 30,
    defense: 24,
    attackRange: 1.4,
    attackIntervalMs: 2000,
    moveSpeed: 2.5,
    aggroRadius: 4,
    leashRadius: 12,
    wanderRadius: 2,
    respawnMs: 20_000,
    xp: 190,
    boss: false,
    shape: "golem",
    color: "#9b8f80",
    size: 0.52,
    drops: {
      gold: { chance: 0.95, min: 15, max: 35 },
      items: [
        { item: "pocao_vida", chance: 0.3 },
        { item: "pocao_mana", chance: 0.2 },
        { item: "equip:2", chance: 0.06 },
        { item: "equip:3", chance: 0.02 },
      ],
    },
  },
  ogro: {
    id: "ogro",
    name: "Ogro Ancestral",
    level: 14,
    maxHp: 2600,
    attackMin: 34,
    attackMax: 48,
    defense: 30,
    attackRange: 1.6,
    attackIntervalMs: 1800,
    moveSpeed: 3.1,
    aggroRadius: 7,
    leashRadius: 14,
    wanderRadius: 2,
    respawnMs: 180_000,
    xp: 1200,
    boss: true,
    shape: "ogre",
    color: "#6f8d3e",
    size: 0.82,
    drops: {
      gold: { chance: 1, min: 150, max: 300 },
      items: [
        { item: "pocao_vida", chance: 1, min: 3, max: 3 },
        { item: "equip:3", chance: 1 },
        { item: "equip:3", chance: 0.5 },
      ],
    },
  },
};

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];
