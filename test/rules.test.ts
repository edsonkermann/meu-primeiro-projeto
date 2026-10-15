import { describe, expect, it } from "vitest";
import { addItem, countItems, createInventory } from "../src/game/inventory";
import { TokenBucket } from "../src/game/ratelimit";
import { INVENTORY_SIZE, MAX_LEVEL, MAX_STACK } from "../src/shared/constants";
import { CLASSES } from "../src/shared/data/classes";
import { computeStats, mitigate, xpMultiplier, xpToNext } from "../src/shared/progression";
import { Rng } from "../src/shared/rng";

describe("inventário", () => {
  it("empilha itens iguais até o limite e usa um novo espaço depois", () => {
    const inventory = createInventory();
    expect(addItem(inventory, "pocao_vida_p", MAX_STACK + 5)).toBe(0);
    expect(inventory[0]).toEqual({ item: "pocao_vida_p", qty: MAX_STACK });
    expect(inventory[1]).toEqual({ item: "pocao_vida_p", qty: 5 });
  });

  it("equipamentos não empilham", () => {
    const inventory = createInventory();
    addItem(inventory, "espada_curta", 2);
    expect(inventory[0]).toEqual({ item: "espada_curta", qty: 1 });
    expect(inventory[1]).toEqual({ item: "espada_curta", qty: 1 });
  });

  it("retorna o que não coube quando o inventário enche", () => {
    const inventory = createInventory();
    expect(addItem(inventory, "espada_curta", INVENTORY_SIZE + 3)).toBe(3);
    expect(countItems(inventory, (slot) => slot.item === "espada_curta")).toBe(INVENTORY_SIZE);
  });

  it("recusa itens inexistentes", () => {
    expect(() => addItem(createInventory(), "item_hackeado", 1)).toThrow();
  });
});

describe("progressão e combate", () => {
  it("a experiência necessária cresce a cada nível e zera no nível máximo", () => {
    for (let level = 1; level < MAX_LEVEL - 1; level++) {
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level));
    }
    expect(xpToNext(MAX_LEVEL)).toBe(0);
  });

  it("os atributos somam classe, nível e equipamentos", () => {
    const base = computeStats(CLASSES.guerreiro, 1, { weapon: null, armor: null });
    const geared = computeStats(CLASSES.guerreiro, 1, { weapon: "espada_curta", armor: "tunica_couro" });
    expect(geared.attackMin).toBe(base.attackMin + 3);
    expect(geared.attackMax).toBe(base.attackMax + 5);
    expect(geared.defense).toBe(base.defense + 4);
    expect(geared.maxHp).toBe(base.maxHp + 10);
    const higher = computeStats(CLASSES.guerreiro, 5, { weapon: null, armor: null });
    expect(higher.maxHp).toBe(base.maxHp + 4 * CLASSES.guerreiro.perLevel.maxHp);
  });

  it("a defesa reduz o dano com retornos decrescentes e nunca zera o golpe", () => {
    expect(mitigate(100, 0)).toBe(100);
    expect(mitigate(100, 60)).toBe(50);
    expect(mitigate(100, 30)).toBeGreaterThan(mitigate(100, 60));
    expect(mitigate(1, 1000)).toBe(1);
  });

  it("monstros muito mais fracos dão pouca experiência", () => {
    expect(xpMultiplier(5, 5)).toBe(1);
    expect(xpMultiplier(5, 7)).toBeCloseTo(1.2);
    expect(xpMultiplier(10, 1)).toBeLessThan(0.2);
  });
});

describe("utilitários", () => {
  it("o gerador aleatório é reproduzível", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("o limitador de taxa permite rajadas curtas e depois bloqueia", () => {
    const bucket = new TokenBucket(3, 1, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(1000)).toBe(true);
  });
});
