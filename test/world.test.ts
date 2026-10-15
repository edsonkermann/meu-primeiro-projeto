import { describe, expect, it } from "vitest";
import { addItem } from "../src/game/inventory";
import { MemoryStore } from "../src/game/store";
import { LOOT_PROTECTION_MS, POTION_COOLDOWN_MS, RESPAWN_DELAY_MS, TICK_MS } from "../src/shared/constants";
import { isSafeZone } from "../src/shared/map";
import { createTestWorld, findOpenSpot, joinPlayer, RecordingLink, tickFor, tickUntil } from "./helpers";

describe("entrada no mundo", () => {
  it("envia boas-vindas e o estado inicial com os itens da classe", async () => {
    const world = createTestWorld();
    const { player, link } = await joinPlayer(world, "Ana", "mago");
    expect(link.messages[0]).toMatchObject({ t: "welcome", you: player.id, seed: world.map.seed });
    const self = link.lastOf("self").s;
    expect(self.cls).toBe("mago");
    expect(self.inventory[0]).toEqual({ item: "pocao_vida_p", qty: 5 });
    expect(self.inventory[1]).toEqual({ item: "pocao_mana", qty: 2 });
    expect(isSafeZone(world.map, player.x, player.y)).toBe(true);
  });

  it("recusa um personagem que já está online, sem diferenciar maiúsculas", async () => {
    const world = createTestWorld();
    await joinPlayer(world, "Ana");
    const result = await world.join("ANA", "mago", new RecordingLink());
    expect(result).toMatchObject({ ok: false, code: "online" });
  });

  it("recusa novos jogadores quando o servidor está cheio", async () => {
    const world = createTestWorld({ maxPlayers: 1 });
    await joinPlayer(world, "Ana");
    const result = await world.join("Bia", "mago", new RecordingLink());
    expect(result).toMatchObject({ ok: false, code: "full" });
  });
});

describe("movimento", () => {
  it("anda até o ponto clicado na velocidade da classe", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "guerreiro");
    const spot = findOpenSpot(world, 1);
    world.teleport(player.id, spot.x, spot.y);
    world.handle(player.id, { t: "move", x: spot.x + 2, y: spot.y });
    tickFor(world, 250);
    expect(player.x - spot.x).toBeCloseTo(player.stats.moveSpeed * 0.25, 1);
    tickFor(world, 1000);
    expect(player.x).toBeCloseTo(spot.x + 2, 5);
    expect(player.y).toBeCloseTo(spot.y, 5);
  });

  it("ignora cliques fora do mapa sem quebrar", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana");
    world.handle(player.id, { t: "move", x: -500, y: 99999 });
    tickFor(world, 500);
    expect(Number.isFinite(player.x)).toBe(true);
  });
});

describe("combate", () => {
  it("derrotar um monstro dá experiência e o loot fica reservado para quem venceu", async () => {
    const world = createTestWorld();
    const { player, link } = await joinPlayer(world, "Ana", "guerreiro");
    const spot = findOpenSpot(world, 1);
    world.teleport(player.id, spot.x, spot.y);
    const slime = world.spawnMonster("gosma", spot.x + 1.5, spot.y);

    world.handle(player.id, { t: "attack", id: slime.id });
    tickUntil(world, () => slime.state === "dead", 20_000);

    expect(player.xp).toBe(slime.def.xp);
    expect(link.events()).toContainEqual({ e: "xp", amount: slime.def.xp });
    expect(link.events().some((e) => e.e === "die" && e.id === slime.id)).toBe(true);
    for (const item of world.items.values()) expect(item.ownerId).toBe(player.id);

    tickFor(world, slime.def.respawnMs + TICK_MS);
    expect(slime.state).toBe("idle");
    expect(slime.hp).toBe(slime.def.maxHp);
  });

  it("monstro agressivo persegue, desiste quando o jogador foge para a vila e volta imune", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "guerreiro");
    const spot = findOpenSpot(world, 1);
    world.teleport(player.id, spot.x, spot.y);
    const wolf = world.spawnMonster("lobo", spot.x + 2, spot.y);

    tickFor(world, 200);
    expect(wolf.state).toBe("chase");

    world.teleport(player.id, world.map.spawn.x, world.map.spawn.y);
    tickFor(world, 100);
    expect(wolf.state).toBe("return");

    tickUntil(world, () => wolf.state === "idle", 15_000);
    expect(wolf.hp).toBe(wolf.def.maxHp);
  });

  it("não existe combate dentro da vila: é preciso sair para atacar", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "arqueira");
    const { map } = world;
    let inside = { x: 0, y: 0 };
    let outside = { x: 0, y: 0 };
    for (let a = 0; a < 64; a++) {
      const angle = (a / 64) * Math.PI * 2;
      const candidateIn = { x: map.town.x + Math.cos(angle) * 5.5, y: map.town.y + Math.sin(angle) * 5.5 };
      const candidateOut = { x: map.town.x + Math.cos(angle) * 9.5, y: map.town.y + Math.sin(angle) * 9.5 };
      if (
        world.playerWalk(Math.floor(candidateIn.x), Math.floor(candidateIn.y)) &&
        world.monsterWalk(Math.floor(candidateOut.x), Math.floor(candidateOut.y))
      ) {
        inside = candidateIn;
        outside = candidateOut;
        break;
      }
    }
    world.teleport(player.id, inside.x, inside.y);
    const slime = world.spawnMonster("gosma", outside.x, outside.y);
    world.handle(player.id, { t: "attack", id: slime.id });

    tickUntil(world, () => slime.hp < slime.def.maxHp, 10_000);
    expect(isSafeZone(map, player.x, player.y)).toBe(false);
  });

  it("jogador derrotado perde um pouco de experiência e renasce na vila", async () => {
    const world = createTestWorld();
    const { player, link } = await joinPlayer(world, "Ana", "guerreiro");
    const spot = findOpenSpot(world, 1);
    world.teleport(player.id, spot.x, spot.y);
    player.xp = 50;
    world.spawnMonster("golem", spot.x + 1.5, spot.y);

    tickUntil(world, () => player.dead, 40_000);
    expect(player.xp).toBe(47);
    tickFor(world, 100); // o aviso chega no próximo snapshot
    expect(link.events().some((e) => e.e === "msg" && e.text.includes("derrotado"))).toBe(true);

    tickFor(world, RESPAWN_DELAY_MS + TICK_MS);
    expect(player.dead).toBe(false);
    expect(player.hp).toBe(player.stats.maxHp);
    expect(isSafeZone(world.map, player.x, player.y)).toBe(true);
  });
});

describe("itens", () => {
  it("poção cura, consome uma unidade e respeita a recarga", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "guerreiro");
    player.hp = 20;
    world.handle(player.id, { t: "potion", kind: "hp" });
    expect(player.hp).toBe(80);
    expect(player.inventory[0]?.qty).toBe(4);

    world.handle(player.id, { t: "potion", kind: "hp" });
    expect(player.inventory[0]?.qty).toBe(4);

    tickFor(world, POTION_COOLDOWN_MS + TICK_MS);
    player.hp = 30;
    world.handle(player.id, { t: "potion", kind: "hp" });
    expect(player.hp).toBe(90);
    expect(player.inventory[0]?.qty).toBe(3);
  });

  it("não gasta poção com a vida cheia", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "guerreiro");
    world.handle(player.id, { t: "potion", kind: "hp" });
    expect(player.inventory[0]?.qty).toBe(5);
  });

  it("equipar respeita nível e classe e troca com o item atual", async () => {
    const world = createTestWorld();
    const { player } = await joinPlayer(world, "Ana", "guerreiro");
    const baseAttack = player.stats.attackMin;
    addItem(player.inventory, "espada_longa", 1); // nível 5
    addItem(player.inventory, "arco_curto", 1); // arqueira
    addItem(player.inventory, "espada_curta", 1);

    world.handle(player.id, { t: "use", slot: 1 });
    world.handle(player.id, { t: "use", slot: 2 });
    expect(player.equipment.weapon).toBeNull();

    world.handle(player.id, { t: "use", slot: 3 });
    expect(player.equipment.weapon).toBe("espada_curta");
    expect(player.inventory[3]).toBeNull();
    expect(player.stats.attackMin).toBe(baseAttack + 3);

    player.level = 5;
    world.handle(player.id, { t: "use", slot: 1 });
    expect(player.equipment.weapon).toBe("espada_longa");
    expect(player.inventory[1]).toEqual({ item: "espada_curta", qty: 1 });

    world.handle(player.id, { t: "unequip", slot: "weapon" });
    expect(player.equipment.weapon).toBeNull();
  });

  it("item reservado só pode ser pego pelo dono até a proteção expirar", async () => {
    const world = createTestWorld();
    const { player: owner } = await joinPlayer(world, "Ana");
    const { player: other, link: otherLink } = await joinPlayer(world, "Bia");
    const spot = findOpenSpot(world, 1);
    world.teleport(owner.id, spot.x - 2, spot.y);
    world.teleport(other.id, spot.x, spot.y);
    const item = world.spawnGroundItem("pocao_vida_p", 2, spot.x + 0.5, spot.y, owner.id);

    world.handle(other.id, { t: "pickup", id: item.id });
    tickFor(world, 500);
    expect(world.items.has(item.id)).toBe(true);
    expect(otherLink.events().some((e) => e.e === "msg" && e.text.includes("reservado"))).toBe(true);

    tickFor(world, LOOT_PROTECTION_MS);
    world.handle(other.id, { t: "pickup", id: item.id });
    tickFor(world, 500);
    expect(world.items.has(item.id)).toBe(false);
    expect(other.inventory[0]).toEqual({ item: "pocao_vida_p", qty: 7 });
  });
});

describe("chat e visibilidade", () => {
  it("o chat é limpo, entregue a todos e tem limite de mensagens", async () => {
    const world = createTestWorld();
    const { player: ana, link: anaLink } = await joinPlayer(world, "Ana");
    const { link: biaLink } = await joinPlayer(world, "Bia");
    biaLink.clear();

    world.handle(ana.id, { t: "chat", text: `  oi ${String.fromCharCode(7)}  pessoal  ` });
    expect(biaLink.lastOf("chat")).toEqual({ t: "chat", from: "Ana", text: "oi pessoal", sys: false });

    for (let i = 0; i < 5; i++) world.handle(ana.id, { t: "chat", text: `spam ${i}` });
    expect(biaLink.ofType("chat").filter((m) => !m.sys)).toHaveLength(3);
    tickFor(world, 100);
    expect(anaLink.events().some((e) => e.e === "msg" && e.text.includes("rápido demais"))).toBe(true);
  });

  it("o snapshot só contém o que está perto do jogador", async () => {
    const world = createTestWorld();
    const { player, link } = await joinPlayer(world, "Ana");
    const near = findOpenSpot(world, 1);
    const far = findOpenSpot(world, 3);
    world.teleport(player.id, near.x, near.y - 1);
    const nearMonster = world.spawnMonster("gosma", near.x, near.y);
    const farMonster = world.spawnMonster("golem", far.x, far.y);
    tickFor(world, 100);
    const ids = link.lastOf("snap").ents.map((e) => e.id);
    expect(ids).toContain(nearMonster.id);
    expect(ids).toContain(player.id);
    if (Math.abs(far.x - player.x) > 22 || Math.abs(far.y - player.y) > 14) {
      expect(ids).not.toContain(farMonster.id);
    }
  });
});

describe("persistência e bots", () => {
  it("salva ao sair e restaura ao entrar de novo", async () => {
    const store = new MemoryStore();
    const world = createTestWorld({ store });
    const { player } = await joinPlayer(world, "Ana", "arqueira");
    player.gold = 77;
    player.xp = 12;
    addItem(player.inventory, "cota_malha", 1);
    await world.leave(player.id);
    expect(world.players.size).toBe(0);

    const { player: again } = await joinPlayer(world, "ana", "guerreiro");
    expect(again.name).toBe("Ana");
    expect(again.cls.id).toBe("arqueira");
    expect(again.gold).toBe(77);
    expect(again.xp).toBe(12);
    expect(again.inventory.some((slot) => slot?.item === "cota_malha")).toBe(true);
  });

  it("bots caçam sozinhos e ganham experiência", async () => {
    const world = createTestWorld({ spawnMonsters: true });
    await world.addBot("Aldric", "guerreiro");
    await world.addBot("Mirela", "arqueira");
    tickFor(world, 3 * 60_000);
    const bots = [...world.players.values()];
    expect(bots.some((bot) => bot.level > 1)).toBe(true);
  });
});
