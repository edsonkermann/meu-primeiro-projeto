import { ITEMS, type ItemDef } from "../shared/data/items";
import { isSafeZone, zoneAt, type Zone } from "../shared/map";
import { dist } from "../shared/math";
import type { ClientMessage } from "../shared/protocol";
import type { Rng } from "../shared/rng";
import type { GroundItem, Monster, Player } from "./entities";
import type { World } from "./world";

const IDLE_CHATTER = [
  "Alguém viu o Ogro Ancestral por aí?",
  "Esses lobos não dão trégua hoje.",
  "Boa caçada a todos!",
  "Quem quer caçar goblins comigo?",
  "Achei uma Cota de Malha, que sorte!",
];

/**
 * Jogador controlado pelo servidor. Ele "joga" usando exatamente as mesmas
 * mensagens que um cliente real envia, então serve também como teste do protocolo.
 */
export class BotController {
  private nextThinkAt = 0;
  private retreating = false;
  private lastLevel = 0;

  constructor(
    private readonly world: World,
    readonly playerId: number,
    private readonly rng: Rng,
  ) {}

  update(now: number): void {
    if (now < this.nextThinkAt) return;
    this.nextThinkAt = now + 350 + this.rng.int(0, 300);
    const me = this.world.players.get(this.playerId);
    if (!me || me.dead) return;
    const send = (message: ClientMessage) => this.world.handle(this.playerId, message);

    if (this.lastLevel === 0) this.lastLevel = me.level;
    if (me.level > this.lastLevel) {
      this.lastLevel = me.level;
      if (this.rng.chance(0.3)) send({ t: "chat", text: `Nível ${me.level}! :)` });
    }
    this.equipUpgrades(me, send);

    const hpRatio = me.hp / me.stats.maxHp;
    if (hpRatio < 0.4 && now >= me.potionReadyAt && this.hasPotion(me, "hp")) send({ t: "potion", kind: "hp" });
    else if (me.intent && me.mp < me.cls.skill.mpCost && now >= me.potionReadyAt && this.hasPotion(me, "mp")) {
      send({ t: "potion", kind: "mp" });
    }

    if (this.retreating) {
      if (hpRatio >= 0.95) this.retreating = false;
      else {
        if (me.path.length === 0 && !isSafeZone(this.world.map, me.x, me.y)) this.goHome(send);
        return;
      }
    }
    if (hpRatio < 0.25 && !this.hasPotion(me, "hp")) {
      this.retreating = true;
      this.goHome(send);
      return;
    }

    if (me.intent?.kind === "pickup") return;
    const loot = this.nearestLoot(me);
    if (loot && (!me.intent || this.rng.chance(0.4))) {
      send({ t: "pickup", id: loot.id });
      return;
    }

    if (me.intent) {
      if (now >= me.skillReadyAt && me.mp >= me.cls.skill.mpCost && this.rng.chance(0.6)) {
        send({ t: "skill", id: me.intent.targetId });
      }
      return;
    }

    const target = this.findTarget(me);
    if (target) {
      send({ t: "attack", id: target.id });
      return;
    }
    if (me.path.length === 0) this.wander(me, send);
    if (this.rng.chance(0.002)) send({ t: "chat", text: this.rng.pick(IDLE_CHATTER) });
  }

  private goHome(send: (message: ClientMessage) => void): void {
    const spawn = this.world.map.spawn;
    send({ t: "move", x: spawn.x + this.rng.range(-2, 2), y: spawn.y + this.rng.range(-1, 1) });
  }

  private hasPotion(me: Player, kind: "hp" | "mp"): boolean {
    return me.inventory.some((slot) => {
      const def = slot ? ITEMS[slot.item] : undefined;
      return kind === "hp" ? Boolean(def?.heal) : Boolean(def?.mana);
    });
  }

  private findTarget(me: Player): Monster | null {
    let best: Monster | null = null;
    let bestScore = Infinity;
    for (const monster of this.world.monsters.values()) {
      if (monster.state === "dead" || monster.state === "return") continue;
      if (monster.def.level > me.level + 2 || monster.def.level < me.level - 5) continue;
      if (monster.def.boss && me.level < 13) continue;
      const d = dist(me, monster);
      if (d > 14) continue;
      // Evita "roubar" o monstro que outro jogador já está enfrentando.
      const score = d + (monster.targetId !== null && monster.targetId !== me.id ? 8 : 0);
      if (score < bestScore) {
        best = monster;
        bestScore = score;
      }
    }
    return best;
  }

  private nearestLoot(me: Player): GroundItem | null {
    const hasSpace = me.inventory.some((slot) => slot === null);
    let best: GroundItem | null = null;
    let bestDistance = 7;
    for (const item of this.world.items.values()) {
      if (item.ownerId !== null && item.ownerId !== me.id) continue;
      if (!hasSpace && item.itemId !== "ouro") continue;
      const d = dist(me, item);
      if (d < bestDistance) {
        best = item;
        bestDistance = d;
      }
    }
    return best;
  }

  private wander(me: Player, send: (message: ClientMessage) => void): void {
    const desired: Zone = me.level < 4 ? 1 : me.level < 9 ? 2 : 3;
    const map = this.world.map;
    for (let attempt = 0; attempt < 30; attempt++) {
      const near = attempt < 20;
      const x = near ? me.x + this.rng.range(-14, 14) : this.rng.range(2, map.width - 2);
      const y = near ? me.y + this.rng.range(-14, 14) : this.rng.range(2, map.height - 2);
      if (zoneAt(map, x, y) !== desired) continue;
      if (!this.world.playerWalk(Math.floor(x), Math.floor(y))) continue;
      send({ t: "move", x, y });
      return;
    }
  }

  private equipUpgrades(me: Player, send: (message: ClientMessage) => void): void {
    const score = (def: ItemDef | undefined) => {
      const b = def?.bonus;
      if (!b) return 0;
      return (
        (b.attackMin ?? 0) + (b.attackMax ?? 0) + (b.defense ?? 0) * 1.5 + (b.maxHp ?? 0) * 0.2 + (b.maxMp ?? 0) * 0.1 + (b.critChance ?? 0) * 100
      );
    };
    for (let slot = 0; slot < me.inventory.length; slot++) {
      const entry = me.inventory[slot];
      const def = entry ? ITEMS[entry.item] : undefined;
      if (!def || (def.kind !== "weapon" && def.kind !== "armor")) continue;
      if (def.levelReq > me.level || (def.classReq && def.classReq !== me.cls.id)) continue;
      const current = me.equipment[def.kind === "weapon" ? "weapon" : "armor"];
      if (score(def) > score(current ? ITEMS[current] : undefined)) {
        send({ t: "use", slot });
        return;
      }
    }
  }
}
