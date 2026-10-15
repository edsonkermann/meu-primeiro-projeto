import type { ClassDef } from "../shared/data/classes";
import type { MonsterDef } from "../shared/data/monsters";
import type { Point } from "../shared/math";
import type { DerivedStats, EquipmentState } from "../shared/progression";
import type { GameEvent, ServerMessage } from "../shared/protocol";
import type { Inventory } from "./inventory";
import type { TokenBucket } from "./ratelimit";

/** Canal de saída para um jogador: WebSocket no servidor, chamada direta na demo. */
export interface ClientLink {
  send(message: ServerMessage): void;
}

/** O que o jogador está tentando fazer com um alvo. O servidor persegue a intenção a cada tick. */
export interface Intent {
  kind: "attack" | "skill" | "pickup";
  targetId: number;
}

export interface Player {
  readonly kind: "player";
  readonly id: number;
  name: string;
  cls: ClassDef;
  x: number;
  y: number;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  gold: number;
  inventory: Inventory;
  equipment: EquipmentState;
  stats: DerivedStats;
  path: Point[];
  intent: Intent | null;
  repathAt: number;
  nextAttackAt: number;
  skillReadyAt: number;
  potionReadyAt: number;
  lastCombatAt: number;
  dead: boolean;
  respawnAt: number;
  link: ClientLink;
  /** Eventos visíveis acumulados até o próximo snapshot. */
  events: GameEvent[];
  dirtySelf: boolean;
  chatBucket: TokenBucket;
  isBot: boolean;
}

export type MonsterState = "idle" | "chase" | "return" | "dead";

export interface Monster {
  readonly kind: "monster";
  readonly id: number;
  def: MonsterDef;
  x: number;
  y: number;
  hp: number;
  spawnX: number;
  spawnY: number;
  state: MonsterState;
  targetId: number | null;
  path: Point[];
  nextAttackAt: number;
  nextWanderAt: number;
  repathAt: number;
  /** Dano recebido por jogador: define a divisão de experiência e o dono do loot. */
  damageBy: Map<number, number>;
  respawnAt: number;
}

export interface GroundItem {
  readonly kind: "item";
  readonly id: number;
  x: number;
  y: number;
  itemId: string;
  qty: number;
  ownerId: number | null;
  ownerUntil: number;
  expiresAt: number;
}

export type Entity = Player | Monster | GroundItem;
