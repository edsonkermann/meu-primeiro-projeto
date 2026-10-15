import type { ClassId } from "./classes";

export type ItemKind = "gold" | "potion" | "weapon" | "armor";
export type Rarity = "comum" | "incomum" | "raro" | "epico";
export type ItemIcon = "gold" | "potion-red" | "potion-red-big" | "potion-blue" | "sword" | "bow" | "staff" | "armor";

export interface ItemBonus {
  attackMin?: number;
  attackMax?: number;
  defense?: number;
  maxHp?: number;
  maxMp?: number;
  critChance?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  icon: ItemIcon;
  description: string;
  levelReq: number;
  classReq: ClassId | null;
  stackable: boolean;
  /** Vida recuperada (poções). */
  heal?: number;
  /** Mana recuperada (poções). */
  mana?: number;
  bonus?: ItemBonus;
}

export const GOLD_ITEM_ID = "ouro";

export const RARITY_NAMES: Record<Rarity, string> = {
  comum: "Comum",
  incomum: "Incomum",
  raro: "Raro",
  epico: "Épico",
};

export const RARITY_COLORS: Record<Rarity, string> = {
  comum: "#e8e4da",
  incomum: "#5fd38d",
  raro: "#5aa9ff",
  epico: "#c48bff",
};

function weapon(
  id: string,
  name: string,
  classReq: ClassId,
  icon: ItemIcon,
  levelReq: number,
  rarity: Rarity,
  bonus: ItemBonus,
  description: string,
): ItemDef {
  return { id, name, kind: "weapon", rarity, icon, description, levelReq, classReq, stackable: false, bonus };
}

function armor(id: string, name: string, levelReq: number, rarity: Rarity, bonus: ItemBonus, description: string): ItemDef {
  return { id, name, kind: "armor", rarity, icon: "armor", description, levelReq, classReq: null, stackable: false, bonus };
}

const ITEM_LIST: ItemDef[] = [
  {
    id: GOLD_ITEM_ID,
    name: "Ouro",
    kind: "gold",
    rarity: "comum",
    icon: "gold",
    description: "Moedas de ouro.",
    levelReq: 1,
    classReq: null,
    stackable: true,
  },
  {
    id: "pocao_vida_p",
    name: "Poção Vermelha Pequena",
    kind: "potion",
    rarity: "comum",
    icon: "potion-red",
    description: "Recupera 60 de vida.",
    levelReq: 1,
    classReq: null,
    stackable: true,
    heal: 60,
  },
  {
    id: "pocao_vida",
    name: "Poção Vermelha",
    kind: "potion",
    rarity: "incomum",
    icon: "potion-red-big",
    description: "Recupera 180 de vida.",
    levelReq: 1,
    classReq: null,
    stackable: true,
    heal: 180,
  },
  {
    id: "pocao_mana",
    name: "Poção Azul",
    kind: "potion",
    rarity: "comum",
    icon: "potion-blue",
    description: "Recupera 60 de mana.",
    levelReq: 1,
    classReq: null,
    stackable: true,
    mana: 60,
  },

  // Armas nível 1
  weapon("espada_curta", "Espada Curta", "guerreiro", "sword", 1, "comum", { attackMin: 3, attackMax: 5 }, "Lâmina simples, mas confiável."),
  weapon("arco_curto", "Arco Curto", "arqueira", "bow", 1, "comum", { attackMin: 3, attackMax: 4, critChance: 0.02 }, "Leve e fácil de puxar."),
  weapon("varinha_freixo", "Varinha de Freixo", "mago", "staff", 1, "comum", { attackMin: 4, attackMax: 6, maxMp: 10 }, "Madeira que conduz bem a magia."),

  // Armas nível 5
  weapon("espada_longa", "Espada Longa", "guerreiro", "sword", 5, "incomum", { attackMin: 8, attackMax: 12 }, "Forjada pelos ferreiros de Arden."),
  weapon("arco_composto", "Arco Composto", "arqueira", "bow", 5, "incomum", { attackMin: 7, attackMax: 10, critChance: 0.03 }, "Camadas de chifre e madeira."),
  weapon("cajado_runico", "Cajado Rúnico", "mago", "staff", 5, "incomum", { attackMin: 10, attackMax: 14, maxMp: 25 }, "Runas antigas brilham ao toque."),

  // Armas nível 10
  weapon("lamina_ancestral", "Lâmina Ancestral", "guerreiro", "sword", 10, "epico", { attackMin: 16, attackMax: 24, maxHp: 40 }, "Dizem que pertenceu ao primeiro rei de Arden."),
  weapon("arco_vendaval", "Arco do Vendaval", "arqueira", "bow", 10, "epico", { attackMin: 14, attackMax: 20, critChance: 0.05 }, "As flechas assobiam como o vento."),
  weapon("cetro_ancestral", "Cetro Ancestral", "mago", "staff", 10, "epico", { attackMin: 18, attackMax: 26, maxMp: 50 }, "Pulsa com uma energia que não é deste mundo."),

  // Armaduras (todas as classes)
  armor("tunica_couro", "Túnica de Couro", 1, "comum", { defense: 4, maxHp: 10 }, "Proteção básica para aventureiros."),
  armor("cota_malha", "Cota de Malha", 5, "incomum", { defense: 10, maxHp: 30 }, "Anéis de aço entrelaçados."),
  armor("armadura_ancestral", "Armadura Ancestral", 10, "epico", { defense: 20, maxHp: 80 }, "Resistiu a mil batalhas."),
];

export const ITEMS: Readonly<Record<string, ItemDef>> = Object.fromEntries(ITEM_LIST.map((item) => [item.id, item]));

export type EquipmentTier = 1 | 2 | 3;

/** Equipamentos por faixa, usados quando um monstro dropa "equip:1", "equip:2" ou "equip:3". */
export const EQUIPMENT_BY_TIER: Record<EquipmentTier, { weapons: Record<ClassId, string>; armor: string }> = {
  1: { weapons: { guerreiro: "espada_curta", arqueira: "arco_curto", mago: "varinha_freixo" }, armor: "tunica_couro" },
  2: { weapons: { guerreiro: "espada_longa", arqueira: "arco_composto", mago: "cajado_runico" }, armor: "cota_malha" },
  3: { weapons: { guerreiro: "lamina_ancestral", arqueira: "arco_vendaval", mago: "cetro_ancestral" }, armor: "armadura_ancestral" },
};

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}
