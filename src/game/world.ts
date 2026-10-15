import {
  AUTOSAVE_INTERVAL_MS,
  DEATH_XP_PENALTY,
  DEFAULT_SEED,
  GAME_NAME,
  GROUND_ITEM_TTL_MS,
  LOOT_PROTECTION_MS,
  MAX_LEVEL,
  OUT_OF_COMBAT_MS,
  PICKUP_RANGE,
  POTION_COOLDOWN_MS,
  RESPAWN_DELAY_MS,
  SNAPSHOT_EVERY_TICKS,
  TICK_MS,
  TICK_RATE,
  VIEW_HALF_HEIGHT,
  VIEW_HALF_WIDTH,
} from "../shared/constants";
import { CLASSES, CLASS_IDS, type ClassId } from "../shared/data/classes";
import { EQUIPMENT_BY_TIER, GOLD_ITEM_ID, ITEMS, type EquipmentTier, type ItemDef } from "../shared/data/items";
import { MONSTERS, type MonsterId } from "../shared/data/monsters";
import { generateMap, isSafeTile, isSafeZone, isWalkable, zoneAt, type GameMap, type Zone } from "../shared/map";
import { clamp, dist, round2, type Point } from "../shared/math";
import { computeStats, mitigate, xpMultiplier, xpToNext } from "../shared/progression";
import {
  sanitizeChat,
  type AttackKind,
  type ClientMessage,
  type EntityView,
  type EquipSlot,
  type ErrorCode,
  type GameEvent,
  type MessageTone,
  type SelfState,
} from "../shared/protocol";
import { Rng } from "../shared/rng";
import { BotController } from "./bots";
import type { ClientLink, Entity, GroundItem, Monster, Player } from "./entities";
import { addItem, cloneInventory, createInventory, removeFromSlot } from "./inventory";
import { findPath, nearestWalkable, smoothPath, type WalkFn } from "./pathfinding";
import { TokenBucket } from "./ratelimit";
import { SpatialGrid } from "./spatial";
import type { CharacterSave, CharacterStore } from "./store";

export type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

export interface WorldOptions {
  store: CharacterStore;
  seed?: number;
  maxPlayers?: number;
  motd?: string;
  log?: LogFn;
  /** Popular o mapa com monstros (desligado nos testes para controlar o cenário). */
  spawnMonsters?: boolean;
}

export type JoinResult = { ok: true; playerId: number } | { ok: false; code: ErrorCode; msg: string };

/** Quantos monstros nascem em cada zona e de quais tipos. */
const SPAWN_PLAN: readonly { zone: Exclude<Zone, 0>; count: number; types: readonly MonsterId[] }[] = [
  { zone: 1, count: 34, types: ["gosma", "gosma", "coelho"] },
  { zone: 2, count: 28, types: ["lobo", "lobo", "goblin"] },
  { zone: 3, count: 24, types: ["esqueleto", "esqueleto", "golem"] },
];

/**
 * O mundo do jogo: a única fonte da verdade.
 *
 * Roda em passos fixos (`tick`) de 50 ms. Cada passo move entidades, resolve
 * combates, aplica regeneração e, a cada 2 passos, envia para cada jogador um
 * snapshot com o que está na área de interesse dele. A mesma classe roda no
 * servidor Node e dentro do navegador na demo offline.
 */
export class World {
  readonly map: GameMap;
  /** Tempo simulado em ms. Toda a lógica usa este relógio, nunca o relógio do sistema. */
  time = 0;
  tickCount = 0;
  readonly players = new Map<number, Player>();
  readonly monsters = new Map<number, Monster>();
  readonly items = new Map<number, GroundItem>();
  readonly playerWalk: WalkFn;
  readonly monsterWalk: WalkFn;

  private readonly rng: Rng;
  private readonly store: CharacterStore;
  private readonly maxPlayers: number;
  private readonly motd: string;
  private readonly log: LogFn;
  private readonly grid = new SpatialGrid<Entity>(8);
  private bots: BotController[] = [];
  private readonly joining = new Set<string>();
  private nextId = 1;
  private lastAutosave = 0;

  constructor(options: WorldOptions) {
    const seed = options.seed ?? DEFAULT_SEED;
    this.map = generateMap(seed);
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.store = options.store;
    this.maxPlayers = options.maxPlayers ?? 100;
    this.motd = options.motd ?? `Bem-vindo a ${GAME_NAME}!`;
    this.log = options.log ?? (() => undefined);
    this.playerWalk = (tx, ty) => isWalkable(this.map, tx, ty);
    this.monsterWalk = (tx, ty) => isWalkable(this.map, tx, ty) && !isSafeTile(this.map, tx, ty);
    if (options.spawnMonsters ?? true) this.populateMonsters();
  }

  /** Move um jogador instantaneamente (útil para testes e futuros comandos de GM). */
  teleport(playerId: number, x: number, y: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.x = x;
    player.y = y;
    player.path = [];
    player.intent = null;
    this.grid.update(player);
  }

  // -------------------------------------------------------------------------
  // Entrada e saída de jogadores
  // -------------------------------------------------------------------------

  get humanCount(): number {
    let count = 0;
    for (const player of this.players.values()) if (!player.isBot) count++;
    return count;
  }

  isOnline(name: string): boolean {
    const key = name.toLowerCase();
    for (const player of this.players.values()) if (player.name.toLowerCase() === key) return true;
    return false;
  }

  async join(name: string, cls: ClassId, link: ClientLink, isBot = false): Promise<JoinResult> {
    const key = name.toLowerCase();
    if (!isBot && this.humanCount + this.joining.size >= this.maxPlayers) {
      return { ok: false, code: "full", msg: "O servidor está cheio. Tente de novo em instantes." };
    }
    if (this.isOnline(name) || this.joining.has(key)) {
      return { ok: false, code: "online", msg: "Esse personagem já está no mundo." };
    }

    this.joining.add(key);
    let save: CharacterSave | null = null;
    try {
      save = isBot ? null : await this.store.load(name);
    } catch (error) {
      this.log("error", "Falha ao carregar personagem", { name, error: String(error) });
      return { ok: false, code: "invalid", msg: "Não foi possível carregar o personagem." };
    } finally {
      this.joining.delete(key);
    }

    const player = this.createPlayer(name, cls, save, link, isBot);
    this.players.set(player.id, player);
    this.grid.insert(player);
    link.send({
      t: "welcome",
      you: player.id,
      seed: this.map.seed,
      w: this.map.width,
      h: this.map.height,
      tickRate: TICK_RATE,
      motd: this.motd,
    });
    this.sendSelf(player);
    if (!isBot) {
      this.broadcastSystem(`${player.name} entrou em ${GAME_NAME}.`);
      this.log("info", "Jogador entrou", { name: player.name, cls: player.cls.id, level: player.level });
    }
    return { ok: true, playerId: player.id };
  }

  async leave(playerId: number): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.grid.remove(player);
    for (const monster of this.monsters.values()) {
      if (monster.targetId === playerId) this.startReturn(monster);
    }
    if (!player.isBot) {
      this.broadcastSystem(`${player.name} saiu do mundo.`);
      this.log("info", "Jogador saiu", { name: player.name });
      await this.savePlayer(player);
    }
  }

  /** Cria um jogador controlado pelo servidor (deixa o mundo da demo mais vivo). */
  async addBot(name: string, cls: ClassId): Promise<void> {
    const result = await this.join(name, cls, { send: () => undefined }, true);
    if (result.ok) this.bots.push(new BotController(this, result.playerId, new Rng(this.rng.int(1, 2 ** 30))));
  }

  // -------------------------------------------------------------------------
  // Comandos vindos do cliente (já validados pelo protocolo)
  // -------------------------------------------------------------------------

  handle(playerId: number, message: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;
    switch (message.t) {
      case "ping":
        player.link.send({ t: "pong", n: message.n });
        return;
      case "chat":
        this.handleChat(player, message.text);
        return;
      case "hello":
        return;
      default:
        break;
    }
    if (player.dead) return;
    switch (message.t) {
      case "move":
        this.commandMove(player, message.x, message.y);
        break;
      case "stop":
        player.path = [];
        player.intent = null;
        break;
      case "attack":
        this.commandTarget(player, "attack", message.id);
        break;
      case "skill":
        this.commandTarget(player, "skill", message.id);
        break;
      case "pickup":
        this.commandPickup(player, message.id);
        break;
      case "use":
        this.useSlot(player, message.slot);
        break;
      case "unequip":
        this.unequip(player, message.slot);
        break;
      case "potion":
        this.quickPotion(player, message.kind);
        break;
    }
  }

  private commandMove(player: Player, x: number, y: number): void {
    player.intent = null;
    let targetX = clamp(x, 0, this.map.width - 0.01);
    let targetY = clamp(y, 0, this.map.height - 0.01);
    let tx = Math.floor(targetX);
    let ty = Math.floor(targetY);
    if (!this.playerWalk(tx, ty)) {
      const near = nearestWalkable(this.playerWalk, tx, ty, 3);
      if (!near) {
        player.path = [];
        return;
      }
      tx = near.x;
      ty = near.y;
      targetX = tx + 0.5;
      targetY = ty + 0.5;
    }
    player.path = this.computePath(player.x, player.y, tx, ty, this.playerWalk, { x: targetX, y: targetY }) ?? [];
  }

  private commandTarget(player: Player, requested: "attack" | "skill", targetId: number): void {
    const monster = this.monsters.get(targetId);
    if (!monster || monster.state === "dead" || !this.inView(player, monster)) return;
    let kind = requested;
    if (kind === "skill") {
      if (this.time < player.skillReadyAt) {
        this.notify(player, "Habilidade em recarga.", "warn");
        kind = "attack";
      } else if (player.mp < player.cls.skill.mpCost) {
        this.notify(player, "Mana insuficiente.", "warn");
        kind = "attack";
      }
    }
    player.intent = { kind, targetId };
    player.repathAt = 0;
  }

  private commandPickup(player: Player, itemId: number): void {
    const item = this.items.get(itemId);
    if (!item || !this.inView(player, item)) return;
    player.intent = { kind: "pickup", targetId: itemId };
    player.repathAt = 0;
  }

  // -------------------------------------------------------------------------
  // Loop principal
  // -------------------------------------------------------------------------

  tick(): void {
    this.time += TICK_MS;
    this.tickCount++;
    const dt = TICK_MS / 1000;

    if (this.bots.length > 0) {
      this.bots = this.bots.filter((bot) => this.players.has(bot.playerId));
      for (const bot of this.bots) bot.update(this.time);
    }
    for (const player of this.players.values()) this.updatePlayer(player, dt);
    for (const monster of this.monsters.values()) this.updateMonster(monster, dt);
    this.updateItems();
    if (this.tickCount % TICK_RATE === 0) this.regenerate();
    if (this.tickCount % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots();
    if (this.time - this.lastAutosave >= AUTOSAVE_INTERVAL_MS) {
      this.lastAutosave = this.time;
      void this.saveAll();
    }
  }

  // -------------------------------------------------------------------------
  // Jogadores
  // -------------------------------------------------------------------------

  private updatePlayer(player: Player, dt: number): void {
    if (player.dead) {
      if (this.time >= player.respawnAt) this.respawnPlayer(player);
      return;
    }

    // Persegue a intenção atual: chega perto do alvo e então ataca ou coleta.
    const intent = player.intent;
    let chase: Point | null = null;
    let stopRange = 0;
    if (intent?.kind === "pickup") {
      const item = this.items.get(intent.targetId);
      if (!item) {
        player.intent = null;
        player.path = [];
      } else if (dist(player, item) <= PICKUP_RANGE) {
        player.intent = null;
        player.path = [];
        this.pickup(player, item);
      } else {
        chase = item;
        stopRange = PICKUP_RANGE * 0.8;
      }
    } else if (intent) {
      const monster = this.monsters.get(intent.targetId);
      if (!monster || monster.state === "dead") {
        player.intent = null;
        player.path = [];
      } else {
        const range = intent.kind === "skill" ? player.cls.skill.range : player.stats.attackRange;
        // Na vila não existe combate: quem está lá dentro precisa sair para atacar.
        const inTown = isSafeZone(this.map, player.x, player.y);
        if (dist(player, monster) <= range && !inTown) {
          player.path = [];
          if (intent.kind === "skill") this.castSkill(player, monster);
          else if (this.time >= player.nextAttackAt) this.playerAttack(player, monster);
        } else {
          chase = monster;
          stopRange = inTown ? 0 : range * 0.9;
        }
      }
    }

    if (chase && (this.time >= player.repathAt || player.path.length === 0)) {
      player.repathAt = this.time + 400;
      const path = this.computePath(
        player.x,
        player.y,
        Math.floor(chase.x),
        Math.floor(chase.y),
        this.playerWalk,
        { x: chase.x, y: chase.y },
        2500,
      );
      if (path) {
        player.path = path;
      } else {
        player.intent = null;
        player.path = [];
      }
    }

    if (player.path.length > 0) {
      this.moveAlong(player, player.stats.moveSpeed * dt);
      if (chase && dist(player, chase) <= stopRange) player.path = [];
      this.grid.update(player);
    }
  }

  private playerAttack(player: Player, monster: Monster): void {
    player.nextAttackAt = this.time + player.stats.attackIntervalMs;
    player.lastCombatAt = this.time;
    this.damageMonster(player, monster, 1, player.cls.attackStyle);
  }

  private castSkill(player: Player, target: Monster): void {
    const skill = player.cls.skill;
    if (this.time < player.skillReadyAt || player.mp < skill.mpCost) {
      player.intent = { kind: "attack", targetId: target.id };
      return;
    }
    player.mp -= skill.mpCost;
    player.skillReadyAt = this.time + skill.cooldownMs;
    player.nextAttackAt = this.time + player.stats.attackIntervalMs;
    player.lastCombatAt = this.time;
    player.dirtySelf = true;

    if (skill.radius > 0) {
      this.emitAt(target.x, target.y, {
        e: "aoe",
        src: player.id,
        x: round2(target.x),
        y: round2(target.y),
        r: skill.radius,
        fx: skill.effect,
      });
      const victims: Monster[] = [];
      this.grid.queryRect(
        target.x - skill.radius,
        target.y - skill.radius,
        target.x + skill.radius,
        target.y + skill.radius,
        (entity) => {
          if (entity.kind === "monster" && dist(entity, target) <= skill.radius) victims.push(entity);
        },
      );
      for (const victim of victims) this.damageMonster(player, victim, skill.multiplier, skill.effect);
    } else {
      this.damageMonster(player, target, skill.multiplier, skill.effect);
    }
    player.intent = target.state === "dead" ? null : { kind: "attack", targetId: target.id };
  }

  private damageMonster(player: Player, monster: Monster, multiplier: number, kind: AttackKind): void {
    if (monster.state === "dead") return;
    if (monster.state === "return") {
      this.emitAt(monster.x, monster.y, { e: "immune", dst: monster.id });
      return;
    }
    const crit = this.rng.chance(player.stats.critChance);
    const raw = this.rng.int(player.stats.attackMin, player.stats.attackMax) * multiplier * (crit ? 1.6 : 1);
    const damage = mitigate(raw, monster.def.defense);
    const dealt = Math.min(damage, monster.hp);
    monster.hp -= damage;
    monster.damageBy.set(player.id, (monster.damageBy.get(player.id) ?? 0) + dealt);
    this.emitAt(monster.x, monster.y, {
      e: "hit",
      src: player.id,
      dst: monster.id,
      dmg: damage,
      crit,
      kind,
      x: round2(monster.x),
      y: round2(monster.y),
    });
    if (monster.hp <= 0) {
      this.killMonster(monster);
      return;
    }
    if (monster.state === "idle") {
      monster.state = "chase";
      monster.targetId = player.id;
      monster.repathAt = 0;
      monster.nextAttackAt = Math.max(monster.nextAttackAt, this.time + 300);
    }
  }

  private grantXp(player: Player, amount: number): void {
    if (player.level >= MAX_LEVEL) return;
    player.xp += amount;
    player.events.push({ e: "xp", amount });
    player.dirtySelf = true;

    let leveled = false;
    while (player.level < MAX_LEVEL && player.xp >= xpToNext(player.level)) {
      player.xp -= xpToNext(player.level);
      player.level++;
      leveled = true;
    }
    if (player.level >= MAX_LEVEL) player.xp = 0;
    if (!leveled) return;

    player.stats = computeStats(player.cls, player.level, player.equipment);
    player.hp = player.stats.maxHp;
    player.mp = player.stats.maxMp;
    this.emitAt(player.x, player.y, { e: "lvl", id: player.id, lvl: player.level });
    if (player.level % 5 === 0) this.broadcastSystem(`${player.name} alcançou o nível ${player.level}!`);
  }

  private killPlayer(player: Player, killer: Monster): void {
    player.hp = 0;
    player.dead = true;
    player.respawnAt = this.time + RESPAWN_DELAY_MS;
    player.path = [];
    player.intent = null;
    const loss = Math.floor(xpToNext(player.level) * DEATH_XP_PENALTY);
    const lost = Math.min(loss, player.xp);
    player.xp -= lost;
    player.dirtySelf = true;
    this.emitAt(player.x, player.y, { e: "die", id: player.id, x: round2(player.x), y: round2(player.y) });
    this.notify(
      player,
      lost > 0
        ? `Você foi derrotado por ${killer.def.name} e perdeu ${lost} de experiência.`
        : `Você foi derrotado por ${killer.def.name}.`,
      "warn",
    );
    for (const monster of this.monsters.values()) {
      if (monster.targetId === player.id) this.startReturn(monster);
    }
  }

  private respawnPlayer(player: Player): void {
    const spot = this.randomSpawnPoint();
    player.dead = false;
    player.hp = player.stats.maxHp;
    player.mp = player.stats.maxMp;
    player.x = spot.x;
    player.y = spot.y;
    player.path = [];
    player.intent = null;
    player.lastCombatAt = -OUT_OF_COMBAT_MS;
    player.dirtySelf = true;
    this.grid.update(player);
  }

  private regenerate(): void {
    for (const player of this.players.values()) {
      if (player.dead) continue;
      const inTown = isSafeZone(this.map, player.x, player.y);
      const resting = this.time - player.lastCombatAt >= OUT_OF_COMBAT_MS;
      const hpRate = resting ? (inTown ? 0.08 : 0.025) : 0;
      const mpRate = resting ? (inTown ? 0.1 : 0.04) : 0.01;
      const hp =
        hpRate > 0
          ? Math.min(player.stats.maxHp, player.hp + Math.max(1, Math.round(player.stats.maxHp * hpRate)))
          : player.hp;
      const mp = Math.min(player.stats.maxMp, player.mp + Math.max(1, Math.round(player.stats.maxMp * mpRate)));
      if (hp !== player.hp || mp !== player.mp) {
        player.hp = hp;
        player.mp = mp;
        player.dirtySelf = true;
      }
    }
  }

  private createPlayer(
    name: string,
    requestedCls: ClassId,
    save: CharacterSave | null,
    link: ClientLink,
    isBot: boolean,
  ): Player {
    const cls = CLASSES[save?.cls ?? requestedCls];
    const level = save?.level ?? 1;
    const equipment = save ? { ...save.equipment } : { weapon: null, armor: null };
    const stats = computeStats(cls, level, equipment);
    const position =
      save && this.playerWalk(Math.floor(save.x), Math.floor(save.y)) ? { x: save.x, y: save.y } : this.randomSpawnPoint();
    const player: Player = {
      kind: "player",
      id: this.nextId++,
      name: save?.name ?? name,
      cls,
      x: position.x,
      y: position.y,
      level,
      xp: save?.xp ?? 0,
      hp: save ? clamp(save.hp, 1, stats.maxHp) : stats.maxHp,
      mp: save ? clamp(save.mp, 0, stats.maxMp) : stats.maxMp,
      gold: save?.gold ?? 0,
      inventory: save ? cloneInventory(save.inventory) : createInventory(),
      equipment,
      stats,
      path: [],
      intent: null,
      repathAt: 0,
      nextAttackAt: 0,
      skillReadyAt: 0,
      potionReadyAt: 0,
      lastCombatAt: -OUT_OF_COMBAT_MS,
      dead: false,
      respawnAt: 0,
      link,
      events: [],
      dirtySelf: true,
      chatBucket: new TokenBucket(3, 0.6, this.time),
      isBot,
    };
    if (!save) {
      for (const starter of cls.starterItems) addItem(player.inventory, starter.item, starter.qty);
    }
    return player;
  }

  private randomSpawnPoint(): Point {
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = this.map.spawn.x + this.rng.range(-1.5, 1.5);
      const y = this.map.spawn.y + this.rng.range(-1, 1);
      if (this.playerWalk(Math.floor(x), Math.floor(y))) return { x, y };
    }
    return { x: this.map.spawn.x, y: this.map.spawn.y };
  }

  // -------------------------------------------------------------------------
  // Itens: chão, inventário e equipamentos
  // -------------------------------------------------------------------------

  spawnGroundItem(itemId: string, qty: number, x: number, y: number, ownerId: number | null): GroundItem {
    const item: GroundItem = {
      kind: "item",
      id: this.nextId++,
      x,
      y,
      itemId,
      qty,
      ownerId,
      ownerUntil: ownerId === null ? 0 : this.time + LOOT_PROTECTION_MS,
      expiresAt: this.time + GROUND_ITEM_TTL_MS,
    };
    this.items.set(item.id, item);
    this.grid.insert(item);
    return item;
  }

  private removeGroundItem(item: GroundItem): void {
    this.items.delete(item.id);
    this.grid.remove(item);
  }

  private pickup(player: Player, item: GroundItem): void {
    if (item.ownerId !== null && item.ownerId !== player.id && this.time < item.ownerUntil) {
      this.notify(player, "Este item ainda está reservado para outro jogador.", "warn");
      return;
    }
    if (item.itemId === GOLD_ITEM_ID) {
      player.gold += item.qty;
      this.notify(player, `+${item.qty} de ouro`, "loot");
      this.removeGroundItem(item);
      player.dirtySelf = true;
      return;
    }
    const def = ITEMS[item.itemId];
    if (!def) {
      this.removeGroundItem(item);
      return;
    }
    const left = addItem(player.inventory, item.itemId, item.qty);
    const taken = item.qty - left;
    if (taken === 0) {
      this.notify(player, "Inventário cheio.", "warn");
      return;
    }
    this.notify(player, taken > 1 ? `${def.name} x${taken}` : def.name, "loot");
    if (left > 0) item.qty = left;
    else this.removeGroundItem(item);
    player.dirtySelf = true;
  }

  private updateItems(): void {
    for (const item of this.items.values()) {
      if (this.time >= item.expiresAt) this.removeGroundItem(item);
      else if (item.ownerId !== null && this.time >= item.ownerUntil) item.ownerId = null;
    }
  }

  private useSlot(player: Player, slot: number): void {
    const entry = player.inventory[slot];
    const def = entry ? ITEMS[entry.item] : undefined;
    if (!def) return;
    if (def.kind === "potion") this.drinkPotion(player, slot, def);
    else if (def.kind === "weapon" || def.kind === "armor") this.equip(player, slot, def);
  }

  private drinkPotion(player: Player, slot: number, def: ItemDef): void {
    if (this.time < player.potionReadyAt) return;
    const heal = def.heal ? Math.min(def.heal, player.stats.maxHp - player.hp) : 0;
    const mana = def.mana ? Math.min(def.mana, player.stats.maxMp - player.mp) : 0;
    if (heal <= 0 && mana <= 0) {
      this.notify(player, def.heal ? "Sua vida já está cheia." : "Sua mana já está cheia.", "info");
      return;
    }
    player.hp += heal;
    player.mp += mana;
    removeFromSlot(player.inventory, slot, 1);
    player.potionReadyAt = this.time + POTION_COOLDOWN_MS;
    player.dirtySelf = true;
    this.emitAt(player.x, player.y, { e: "heal", id: player.id, hp: heal, mp: mana });
  }

  /** Escolhe a poção que mais se aproxima do que falta recuperar, evitando desperdício. */
  private quickPotion(player: Player, kind: "hp" | "mp"): void {
    const missing = kind === "hp" ? player.stats.maxHp - player.hp : player.stats.maxMp - player.mp;
    let bestSlot = -1;
    let bestScore = Infinity;
    player.inventory.forEach((entry, i) => {
      const def = entry ? ITEMS[entry.item] : undefined;
      const amount = kind === "hp" ? def?.heal : def?.mana;
      if (!amount) return;
      const waste = Math.max(0, amount - missing);
      const score = Math.abs(amount - missing) + waste * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestSlot = i;
      }
    });
    if (bestSlot < 0) {
      this.notify(player, kind === "hp" ? "Você não tem poções de vida." : "Você não tem poções de mana.", "warn");
      return;
    }
    this.useSlot(player, bestSlot);
  }

  private equip(player: Player, slot: number, def: ItemDef): void {
    if (player.level < def.levelReq) {
      this.notify(player, `${def.name} requer nível ${def.levelReq}.`, "warn");
      return;
    }
    if (def.classReq && def.classReq !== player.cls.id) {
      this.notify(player, `${def.name} é exclusivo para ${CLASSES[def.classReq].name}.`, "warn");
      return;
    }
    const equipSlot: EquipSlot = def.kind === "weapon" ? "weapon" : "armor";
    const previous = player.equipment[equipSlot];
    player.equipment[equipSlot] = def.id;
    player.inventory[slot] = previous ? { item: previous, qty: 1 } : null;
    this.refreshStats(player);
  }

  private unequip(player: Player, equipSlot: EquipSlot): void {
    const current = player.equipment[equipSlot];
    if (!current) return;
    const free = player.inventory.findIndex((entry) => entry === null);
    if (free < 0) {
      this.notify(player, "Inventário cheio.", "warn");
      return;
    }
    player.inventory[free] = { item: current, qty: 1 };
    player.equipment[equipSlot] = null;
    this.refreshStats(player);
  }

  private refreshStats(player: Player): void {
    player.stats = computeStats(player.cls, player.level, player.equipment);
    player.hp = Math.min(player.hp, player.stats.maxHp);
    player.mp = Math.min(player.mp, player.stats.maxMp);
    player.dirtySelf = true;
  }

  // -------------------------------------------------------------------------
  // Monstros
  // -------------------------------------------------------------------------

  spawnMonster(id: MonsterId, x: number, y: number): Monster {
    const def = MONSTERS[id];
    const monster: Monster = {
      kind: "monster",
      id: this.nextId++,
      def,
      x,
      y,
      hp: def.maxHp,
      spawnX: x,
      spawnY: y,
      state: "idle",
      targetId: null,
      path: [],
      nextAttackAt: 0,
      nextWanderAt: this.time + this.rng.int(0, 6000),
      repathAt: 0,
      damageBy: new Map(),
      respawnAt: 0,
    };
    this.monsters.set(monster.id, monster);
    this.grid.insert(monster);
    return monster;
  }

  private populateMonsters(): void {
    const candidates: Record<1 | 2 | 3, Point[]> = { 1: [], 2: [], 3: [] };
    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        if (!this.monsterWalk(tx, ty)) continue;
        const zone = zoneAt(this.map, tx + 0.5, ty + 0.5);
        if (zone !== 0) candidates[zone].push({ x: tx + 0.5, y: ty + 0.5 });
      }
    }

    const taken: Point[] = [];
    const isFree = (p: Point, minDistance: number) => taken.every((t) => dist(t, p) >= minDistance);
    for (const plan of SPAWN_PLAN) {
      const pool = candidates[plan.zone];
      let placed = 0;
      for (let attempt = 0; attempt < plan.count * 60 && placed < plan.count && pool.length > 0; attempt++) {
        const spot = this.rng.pick(pool);
        if (!isFree(spot, 3.2)) continue;
        taken.push(spot);
        this.spawnMonster(this.rng.pick(plan.types), spot.x, spot.y);
        placed++;
      }
    }

    // O chefe mora no ponto mais distante da vila.
    let lair: Point | null = null;
    let lairDistance = -1;
    for (const spot of candidates[3]) {
      const d = Math.hypot(spot.x - this.map.town.x, spot.y - this.map.town.y);
      if (d > lairDistance && isFree(spot, 5)) {
        lair = spot;
        lairDistance = d;
      }
    }
    if (lair) this.spawnMonster("ogro", lair.x, lair.y);
  }

  private updateMonster(monster: Monster, dt: number): void {
    switch (monster.state) {
      case "dead":
        if (this.time >= monster.respawnAt) this.respawnMonster(monster);
        return;
      case "idle":
        this.monsterIdle(monster, dt);
        return;
      case "chase":
        this.monsterChase(monster, dt);
        return;
      case "return":
        this.monsterReturn(monster, dt);
        return;
    }
  }

  private monsterIdle(monster: Monster, dt: number): void {
    if (monster.def.aggroRadius > 0) {
      const target = this.findAggroTarget(monster);
      if (target) {
        monster.state = "chase";
        monster.targetId = target.id;
        monster.repathAt = 0;
        monster.nextAttackAt = Math.max(monster.nextAttackAt, this.time + 400);
        return;
      }
    }
    if (monster.path.length === 0 && this.time >= monster.nextWanderAt) {
      monster.nextWanderAt = this.time + this.rng.int(3000, 8000);
      const radius = monster.def.wanderRadius;
      const tx = Math.floor(monster.spawnX + this.rng.range(-radius, radius));
      const ty = Math.floor(monster.spawnY + this.rng.range(-radius, radius));
      if (this.monsterWalk(tx, ty)) {
        monster.path = this.computePath(monster.x, monster.y, tx, ty, this.monsterWalk, null, 400) ?? [];
      }
    }
    if (monster.path.length > 0) {
      this.moveAlong(monster, monster.def.moveSpeed * 0.45 * dt);
      this.grid.update(monster);
    }
  }

  /** Monstros agressivos atacam quem chega perto, mas ignoram quem é muito mais forte. */
  private findAggroTarget(monster: Monster): Player | null {
    let best: Player | null = null;
    let bestDistance = monster.def.aggroRadius;
    for (const player of this.players.values()) {
      if (player.dead || player.level - monster.def.level >= 6) continue;
      if (isSafeZone(this.map, player.x, player.y)) continue;
      const d = dist(monster, player);
      if (d <= bestDistance) {
        best = player;
        bestDistance = d;
      }
    }
    return best;
  }

  private monsterChase(monster: Monster, dt: number): void {
    const target = monster.targetId !== null ? this.players.get(monster.targetId) : undefined;
    const tooFar = Math.hypot(monster.x - monster.spawnX, monster.y - monster.spawnY) > monster.def.leashRadius;
    if (!target || target.dead || isSafeZone(this.map, target.x, target.y) || tooFar) {
      this.startReturn(monster);
      return;
    }

    if (dist(monster, target) <= monster.def.attackRange) {
      monster.path = [];
      if (this.time >= monster.nextAttackAt) {
        monster.nextAttackAt = this.time + monster.def.attackIntervalMs;
        this.monsterAttack(monster, target);
      }
      return;
    }

    if (this.time >= monster.repathAt || monster.path.length === 0) {
      monster.repathAt = this.time + 350;
      const goal = nearestWalkable(this.monsterWalk, Math.floor(target.x), Math.floor(target.y), 2);
      const exact = goal && goal.x === Math.floor(target.x) && goal.y === Math.floor(target.y);
      const path = goal
        ? this.computePath(
            monster.x,
            monster.y,
            goal.x,
            goal.y,
            this.monsterWalk,
            exact ? { x: target.x, y: target.y } : { x: goal.x + 0.5, y: goal.y + 0.5 },
            800,
          )
        : null;
      if (!path) {
        this.startReturn(monster);
        return;
      }
      monster.path = path;
    }
    this.moveAlong(monster, monster.def.moveSpeed * dt);
    if (dist(monster, target) <= monster.def.attackRange * 0.9) monster.path = [];
    this.grid.update(monster);
  }

  private monsterAttack(monster: Monster, player: Player): void {
    const damage = mitigate(this.rng.int(monster.def.attackMin, monster.def.attackMax), player.stats.defense);
    player.hp -= damage;
    player.lastCombatAt = this.time;
    player.dirtySelf = true;
    this.emitAt(player.x, player.y, {
      e: "hit",
      src: monster.id,
      dst: player.id,
      dmg: damage,
      crit: false,
      kind: "monster",
      x: round2(player.x),
      y: round2(player.y),
    });
    if (player.hp <= 0) this.killPlayer(player, monster);
  }

  /** Desiste da perseguição: volta para casa imune a dano e recupera a vida ao chegar. */
  private startReturn(monster: Monster): void {
    monster.state = "return";
    monster.targetId = null;
    monster.damageBy.clear();
    const path = this.computePath(
      monster.x,
      monster.y,
      Math.floor(monster.spawnX),
      Math.floor(monster.spawnY),
      this.monsterWalk,
      { x: monster.spawnX, y: monster.spawnY },
      2500,
    );
    if (path) {
      monster.path = path;
    } else {
      monster.x = monster.spawnX;
      monster.y = monster.spawnY;
      monster.path = [];
      this.grid.update(monster);
    }
  }

  private monsterReturn(monster: Monster, dt: number): void {
    if (monster.path.length > 0) {
      this.moveAlong(monster, monster.def.moveSpeed * 1.25 * dt);
      this.grid.update(monster);
    }
    if (monster.path.length === 0) {
      monster.state = "idle";
      monster.hp = monster.def.maxHp;
      monster.nextWanderAt = this.time + 2000;
    }
  }

  private killMonster(monster: Monster): void {
    monster.state = "dead";
    monster.hp = 0;
    monster.path = [];
    monster.targetId = null;
    monster.respawnAt = this.time + monster.def.respawnMs;
    this.grid.remove(monster);
    this.emitAt(monster.x, monster.y, { e: "die", id: monster.id, x: round2(monster.x), y: round2(monster.y) });

    // Experiência dividida pelo dano causado; o loot fica com quem mais bateu.
    let total = 0;
    for (const damage of monster.damageBy.values()) total += damage;
    let owner: Player | null = null;
    let best = 0;
    for (const [playerId, damage] of monster.damageBy) {
      const player = this.players.get(playerId);
      if (!player || player.dead || total <= 0) continue;
      if (damage > best) {
        best = damage;
        owner = player;
      }
      const xp = Math.round(monster.def.xp * (damage / total) * xpMultiplier(player.level, monster.def.level));
      this.grantXp(player, Math.max(1, xp));
    }
    monster.damageBy.clear();
    this.dropLoot(monster, owner);
    if (monster.def.boss) {
      this.broadcastSystem(owner ? `${owner.name} derrotou o ${monster.def.name}!` : `O ${monster.def.name} foi derrotado!`);
    }
  }

  private respawnMonster(monster: Monster): void {
    monster.state = "idle";
    monster.hp = monster.def.maxHp;
    monster.x = monster.spawnX;
    monster.y = monster.spawnY;
    monster.path = [];
    monster.targetId = null;
    monster.damageBy.clear();
    monster.nextWanderAt = this.time + this.rng.int(1000, 5000);
    this.grid.insert(monster);
  }

  private dropLoot(monster: Monster, owner: Player | null): void {
    const table = monster.def.drops;
    const drops: { itemId: string; qty: number }[] = [];
    if (this.rng.chance(table.gold.chance)) {
      drops.push({ itemId: GOLD_ITEM_ID, qty: this.rng.int(table.gold.min, table.gold.max) });
    }
    for (const entry of table.items) {
      if (!this.rng.chance(entry.chance)) continue;
      if (entry.item.startsWith("equip:")) {
        const tier = Number(entry.item.slice("equip:".length)) as EquipmentTier;
        drops.push({ itemId: this.rollEquipment(tier, owner?.cls.id ?? null), qty: 1 });
      } else {
        drops.push({ itemId: entry.item, qty: this.rng.int(entry.min ?? 1, entry.max ?? 1) });
      }
    }

    const spread = drops.length > 1 ? 0.6 : 0;
    drops.forEach((drop, i) => {
      const angle = (i / drops.length) * Math.PI * 2 + this.rng.range(0, 0.8);
      let x = monster.x + Math.cos(angle) * spread;
      let y = monster.y + Math.sin(angle) * spread;
      if (!this.playerWalk(Math.floor(x), Math.floor(y))) {
        x = monster.x;
        y = monster.y;
      }
      this.spawnGroundItem(drop.itemId, drop.qty, x, y, owner?.id ?? null);
    });
  }

  /** Loot pessoal: armas sempre da classe de quem ganhou o drop. */
  private rollEquipment(tier: EquipmentTier, cls: ClassId | null): string {
    const set = EQUIPMENT_BY_TIER[tier];
    if (this.rng.chance(0.4)) return set.armor;
    return set.weapons[cls ?? this.rng.pick(CLASS_IDS)];
  }

  // -------------------------------------------------------------------------
  // Movimento
  // -------------------------------------------------------------------------

  private computePath(
    fromX: number,
    fromY: number,
    tx: number,
    ty: number,
    walk: WalkFn,
    end: Point | null,
    maxNodes = 3000,
  ): Point[] | null {
    let sx = Math.floor(fromX);
    let sy = Math.floor(fromY);
    if (!walk(sx, sy)) {
      const near = nearestWalkable(walk, sx, sy, 2);
      if (!near) return null;
      sx = near.x;
      sy = near.y;
    }
    const tiles = findPath(this.map.width, this.map.height, walk, sx, sy, tx, ty, maxNodes);
    if (!tiles) return null;
    const points: Point[] = tiles.map((tile) => ({ x: tile.x + 0.5, y: tile.y + 0.5 }));
    if (end) {
      if (points.length > 0) points[points.length - 1] = end;
      else points.push(end);
    }
    return smoothPath(walk, fromX, fromY, points);
  }

  private moveAlong(entity: { x: number; y: number; path: Point[] }, distance: number): void {
    let remaining = distance;
    while (remaining > 0 && entity.path.length > 0) {
      const waypoint = entity.path[0] as Point;
      const dx = waypoint.x - entity.x;
      const dy = waypoint.y - entity.y;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) {
        entity.x = waypoint.x;
        entity.y = waypoint.y;
        remaining -= d;
        entity.path.shift();
      } else {
        entity.x += (dx / d) * remaining;
        entity.y += (dy / d) * remaining;
        remaining = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Chat, eventos e snapshots
  // -------------------------------------------------------------------------

  private handleChat(player: Player, text: string): void {
    const clean = sanitizeChat(text);
    if (!clean) return;
    if (!player.chatBucket.take(this.time)) {
      this.notify(player, "Calma! Você está enviando mensagens rápido demais.", "warn");
      return;
    }
    for (const other of this.players.values()) {
      other.link.send({ t: "chat", from: player.name, text: clean, sys: false });
    }
  }

  broadcastSystem(text: string): void {
    for (const player of this.players.values()) player.link.send({ t: "chat", from: "", text, sys: true });
  }

  private notify(player: Player, text: string, tone: MessageTone): void {
    player.events.push({ e: "msg", text, tone });
  }

  /** Entrega um evento a todos os jogadores que conseguem ver a posição (x, y). */
  private emitAt(x: number, y: number, event: GameEvent): void {
    for (const player of this.players.values()) {
      if (player.isBot) continue;
      if (Math.abs(player.x - x) <= VIEW_HALF_WIDTH + 2 && Math.abs(player.y - y) <= VIEW_HALF_HEIGHT + 2) {
        player.events.push(event);
      }
    }
  }

  private inView(player: Player, target: Point): boolean {
    return Math.abs(player.x - target.x) <= VIEW_HALF_WIDTH + 1 && Math.abs(player.y - target.y) <= VIEW_HALF_HEIGHT + 1;
  }

  private sendSnapshots(): void {
    for (const player of this.players.values()) {
      if (player.isBot) {
        player.events.length = 0;
        player.dirtySelf = false;
        continue;
      }
      const entities: EntityView[] = [];
      this.grid.queryRect(
        player.x - VIEW_HALF_WIDTH,
        player.y - VIEW_HALF_HEIGHT,
        player.x + VIEW_HALF_WIDTH,
        player.y + VIEW_HALF_HEIGHT,
        (entity) => entities.push(this.view(entity, player)),
      );
      if (player.dirtySelf) this.sendSelf(player);
      player.link.send({ t: "snap", tick: this.tickCount, ents: entities, ev: player.events });
      player.events = [];
    }
  }

  private view(entity: Entity, viewer: Player): EntityView {
    switch (entity.kind) {
      case "player":
        return {
          id: entity.id,
          k: "p",
          x: round2(entity.x),
          y: round2(entity.y),
          name: entity.name,
          cls: entity.cls.id,
          lvl: entity.level,
          hp: entity.hp,
          mhp: entity.stats.maxHp,
          dead: entity.dead,
          bot: entity.isBot,
        };
      case "monster":
        return {
          id: entity.id,
          k: "m",
          x: round2(entity.x),
          y: round2(entity.y),
          mid: entity.def.id,
          hp: entity.hp,
          mhp: entity.def.maxHp,
          evade: entity.state === "return",
        };
      case "item":
        return {
          id: entity.id,
          k: "i",
          x: round2(entity.x),
          y: round2(entity.y),
          item: entity.itemId,
          qty: entity.qty,
          lock: entity.ownerId === null ? 0 : entity.ownerId === viewer.id ? 1 : 2,
        };
    }
  }

  selfState(player: Player): SelfState {
    return {
      id: player.id,
      name: player.name,
      cls: player.cls.id,
      level: player.level,
      xp: player.xp,
      xpNext: xpToNext(player.level),
      hp: player.hp,
      mp: player.mp,
      gold: player.gold,
      stats: { ...player.stats },
      inventory: cloneInventory(player.inventory),
      equipment: { ...player.equipment },
      skillCd: Math.max(0, player.skillReadyAt - this.time),
      potionCd: Math.max(0, player.potionReadyAt - this.time),
      dead: player.dead,
      respawnIn: player.dead ? Math.max(0, player.respawnAt - this.time) : 0,
    };
  }

  private sendSelf(player: Player): void {
    player.dirtySelf = false;
    player.link.send({ t: "self", s: this.selfState(player) });
  }

  // -------------------------------------------------------------------------
  // Persistência
  // -------------------------------------------------------------------------

  private toSave(player: Player): CharacterSave {
    const atSpawn = player.dead || !this.playerWalk(Math.floor(player.x), Math.floor(player.y));
    return {
      version: 1,
      name: player.name,
      cls: player.cls.id,
      level: player.level,
      xp: player.xp,
      hp: player.dead ? player.stats.maxHp : player.hp,
      mp: player.mp,
      gold: player.gold,
      inventory: cloneInventory(player.inventory),
      equipment: { ...player.equipment },
      x: atSpawn ? this.map.spawn.x : round2(player.x),
      y: atSpawn ? this.map.spawn.y : round2(player.y),
      savedAt: Date.now(),
    };
  }

  private async savePlayer(player: Player): Promise<void> {
    if (player.isBot) return;
    try {
      await this.store.save(this.toSave(player));
    } catch (error) {
      this.log("error", "Falha ao salvar personagem", { name: player.name, error: String(error) });
    }
  }

  /** Cópia do personagem no formato de save (usada pela demo para não perder progresso ao recarregar). */
  exportCharacter(playerId: number): CharacterSave | null {
    const player = this.players.get(playerId);
    return player && !player.isBot ? this.toSave(player) : null;
  }

  async saveAll(): Promise<void> {
    await Promise.all([...this.players.values()].map((player) => this.savePlayer(player)));
  }

  stats(): { players: number; bots: number; monstersAlive: number; groundItems: number; tick: number } {
    let alive = 0;
    for (const monster of this.monsters.values()) if (monster.state !== "dead") alive++;
    return {
      players: this.humanCount,
      bots: this.bots.length,
      monstersAlive: alive,
      groundItems: this.items.size,
      tick: this.tickCount,
    };
  }
}
