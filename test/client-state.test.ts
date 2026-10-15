import { describe, expect, it } from "vitest";
import { ClientState } from "../src/client/state";
import type { EntityView, GameEvent, ServerMessage } from "../src/shared/protocol";

const TICK = 50;
const snap = (tick: number, ents: EntityView[], ev: GameEvent[] = []): Extract<ServerMessage, { t: "snap" }> => ({
  t: "snap",
  tick,
  ents,
  ev,
});
const hero = (x: number, y: number): EntityView => ({
  id: 1,
  k: "p",
  x,
  y,
  name: "Ana",
  cls: "mago",
  lvl: 1,
  hp: 10,
  mhp: 10,
  dead: false,
  bot: false,
});

describe("estado do cliente", () => {
  it("interpola a posição entre dois snapshots, desenhando ~110 ms no passado", () => {
    const state = new ClientState();
    state.applySnapshot(snap(10, [hero(0, 0)]), 1000); // tempo do servidor 500
    state.applySnapshot(snap(12, [hero(1, 0)]), 1100); // tempo do servidor 600
    state.update(1160); // renderiza o instante 550 do servidor: metade do caminho
    expect(state.entities.get(1)?.x).toBeCloseTo(0.5, 5);
    expect(state.entities.get(1)?.moving).toBe(true);
  });

  it("não interpola saltos grandes (renascer, teleporte)", () => {
    const state = new ClientState();
    state.applySnapshot(snap(10, [hero(0, 0)]), 1000);
    state.applySnapshot(snap(12, [hero(30, 30)]), 1100);
    state.update(1160);
    expect(state.entities.get(1)?.x).toBe(0);
    state.update(1220);
    expect(state.entities.get(1)?.x).toBe(30);
  });

  it("entrega os eventos no mesmo atraso das posições", () => {
    const state = new ClientState();
    const event: GameEvent = { e: "msg", text: "+3 de ouro", tone: "loot" };
    state.applySnapshot(snap(10, [hero(0, 0)]), 1000);
    state.applySnapshot(snap(12, [hero(0, 0)], [event]), 1100);
    expect(state.update(1100)).toEqual([]);
    expect(state.update(1100 + 2 * TICK + 20)).toEqual([event]);
  });

  it("remove quem saiu do snapshot só quando o desenho alcança aquele momento", () => {
    const state = new ClientState();
    state.applySnapshot(snap(10, [hero(0, 0)]), 1000);
    state.applySnapshot(snap(12, []), 1100);
    state.update(1150);
    expect(state.entities.has(1)).toBe(true);
    state.update(1250);
    expect(state.entities.has(1)).toBe(false);
    expect(state.lookup(1)?.view.k).toBe("p");
  });

  it("conta a recarga a partir do momento em que o estado chegou", () => {
    const state = new ClientState();
    state.selfReceivedAt = 1000;
    expect(state.cooldownLeft(3000, 1500)).toBe(2500);
    expect(state.cooldownLeft(3000, 9000)).toBe(0);
  });
});
