/**
 * Protocolo de rede entre cliente e servidor (JSON sobre WebSocket).
 *
 * Regra de ouro: o cliente só envia INTENÇÕES ("quero andar até ali", "quero
 * atacar aquele monstro"). Quem decide o resultado é sempre o servidor.
 */
import { CHAT_MAX_LENGTH, INVENTORY_SIZE, MAX_MESSAGE_BYTES, NAME_PATTERN } from "./constants";
import { CLASS_IDS, type AttackStyle, type ClassId, type SkillEffect } from "./data/classes";
import type { MonsterId } from "./data/monsters";
import type { DerivedStats, EquipmentState } from "./progression";

export type EquipSlot = keyof EquipmentState;

// ---------------------------------------------------------------------------
// Cliente → Servidor
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: "hello"; v: number; name: string; cls: ClassId }
  | { t: "move"; x: number; y: number }
  | { t: "attack"; id: number }
  | { t: "skill"; id: number }
  | { t: "pickup"; id: number }
  | { t: "use"; slot: number }
  | { t: "unequip"; slot: EquipSlot }
  | { t: "potion"; kind: "hp" | "mp" }
  | { t: "chat"; text: string }
  | { t: "stop" }
  | { t: "ping"; n: number };

// ---------------------------------------------------------------------------
// Servidor → Cliente
// ---------------------------------------------------------------------------

export interface PlayerView {
  id: number;
  k: "p";
  x: number;
  y: number;
  name: string;
  cls: ClassId;
  lvl: number;
  hp: number;
  mhp: number;
  dead: boolean;
  bot: boolean;
}

export interface MonsterView {
  id: number;
  k: "m";
  x: number;
  y: number;
  mid: MonsterId;
  hp: number;
  mhp: number;
  /** Voltando para casa: imune a dano até chegar. */
  evade: boolean;
}

export interface ItemView {
  id: number;
  k: "i";
  x: number;
  y: number;
  item: string;
  qty: number;
  /** 0 = livre, 1 = reservado para você, 2 = reservado para outro jogador. */
  lock: 0 | 1 | 2;
}

export type EntityView = PlayerView | MonsterView | ItemView;

export type AttackKind = AttackStyle | SkillEffect | "monster";
export type MessageTone = "info" | "loot" | "warn";

export type GameEvent =
  | { e: "hit"; src: number; dst: number; dmg: number; crit: boolean; kind: AttackKind; x: number; y: number }
  | { e: "immune"; dst: number }
  | { e: "aoe"; src: number; x: number; y: number; r: number; fx: SkillEffect }
  | { e: "die"; id: number; x: number; y: number }
  | { e: "heal"; id: number; hp: number; mp: number }
  | { e: "lvl"; id: number; lvl: number }
  | { e: "xp"; amount: number }
  | { e: "msg"; text: string; tone: MessageTone };

export interface InvSlot {
  item: string;
  qty: number;
}

/** Estado privado do seu personagem: só você recebe. */
export interface SelfState {
  id: number;
  name: string;
  cls: ClassId;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  mp: number;
  gold: number;
  stats: DerivedStats;
  inventory: (InvSlot | null)[];
  equipment: EquipmentState;
  /** Milissegundos restantes de recarga no momento do envio. */
  skillCd: number;
  potionCd: number;
  dead: boolean;
  respawnIn: number;
}

export type ErrorCode = "version" | "name" | "online" | "full" | "invalid";

export type ServerMessage =
  | { t: "welcome"; you: number; seed: number; w: number; h: number; tickRate: number; motd: string }
  | { t: "snap"; tick: number; ents: EntityView[]; ev: GameEvent[] }
  | { t: "self"; s: SelfState }
  | { t: "chat"; from: string; text: string; sys: boolean }
  | { t: "err"; code: ErrorCode; msg: string }
  | { t: "pong"; n: number };

// ---------------------------------------------------------------------------
// Validação: nada que vem do cliente é confiável.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e6;
const isEntityId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * Converte o texto recebido em uma mensagem tipada, ou `null` se for inválido.
 * Tudo é checado: tipos, faixas de valores, tamanhos e campos permitidos.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  switch (data.t) {
    case "hello": {
      const { v, name, cls } = data;
      if (typeof v !== "number" || !Number.isSafeInteger(v)) return null;
      if (typeof name !== "string" || !NAME_PATTERN.test(name)) return null;
      if (typeof cls !== "string" || !(CLASS_IDS as readonly string[]).includes(cls)) return null;
      return { t: "hello", v, name, cls: cls as ClassId };
    }
    case "move":
      return isCoord(data.x) && isCoord(data.y) ? { t: "move", x: data.x, y: data.y } : null;
    case "attack":
      return isEntityId(data.id) ? { t: "attack", id: data.id } : null;
    case "skill":
      return isEntityId(data.id) ? { t: "skill", id: data.id } : null;
    case "pickup":
      return isEntityId(data.id) ? { t: "pickup", id: data.id } : null;
    case "use": {
      const slot = data.slot;
      return typeof slot === "number" && Number.isInteger(slot) && slot >= 0 && slot < INVENTORY_SIZE
        ? { t: "use", slot }
        : null;
    }
    case "unequip":
      return data.slot === "weapon" || data.slot === "armor" ? { t: "unequip", slot: data.slot } : null;
    case "potion":
      return data.kind === "hp" || data.kind === "mp" ? { t: "potion", kind: data.kind } : null;
    case "chat":
      return typeof data.text === "string" && data.text.length <= CHAT_MAX_LENGTH * 2
        ? { t: "chat", text: data.text }
        : null;
    case "stop":
      return { t: "stop" };
    case "ping":
      return typeof data.n === "number" && Number.isFinite(data.n) ? { t: "ping", n: data.n } : null;
    default:
      return null;
  }
}

/** Remove caracteres de controle, junta espaços repetidos e limita o tamanho. */
export function sanitizeChat(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}
