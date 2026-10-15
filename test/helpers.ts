import type { ClientLink, Player } from "../src/game/entities";
import { MemoryStore, type CharacterStore } from "../src/game/store";
import { World } from "../src/game/world";
import { TICK_MS } from "../src/shared/constants";
import type { ClassId } from "../src/shared/data/classes";
import { zoneAt, type Zone } from "../src/shared/map";
import type { Point } from "../src/shared/math";
import type { GameEvent, ServerMessage } from "../src/shared/protocol";

/** Link que guarda tudo o que o servidor enviaria pela rede. */
export class RecordingLink implements ClientLink {
  readonly messages: ServerMessage[] = [];

  send(message: ServerMessage): void {
    this.messages.push(structuredClone(message));
  }

  ofType<T extends ServerMessage["t"]>(type: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
  }

  lastOf<T extends ServerMessage["t"]>(type: T): Extract<ServerMessage, { t: T }> {
    const all = this.ofType(type);
    const last = all[all.length - 1];
    if (!last) throw new Error(`Nenhuma mensagem do tipo ${type}`);
    return last;
  }

  events(): GameEvent[] {
    return this.ofType("snap").flatMap((snap) => snap.ev);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export function createTestWorld(options: { store?: CharacterStore; maxPlayers?: number; spawnMonsters?: boolean } = {}): World {
  return new World({
    store: options.store ?? new MemoryStore(),
    maxPlayers: options.maxPlayers,
    spawnMonsters: options.spawnMonsters ?? false,
  });
}

export async function joinPlayer(
  world: World,
  name: string,
  cls: ClassId = "guerreiro",
): Promise<{ player: Player; link: RecordingLink }> {
  const link = new RecordingLink();
  const result = await world.join(name, cls, link);
  if (!result.ok) throw new Error(`Falha ao entrar: ${result.msg}`);
  const player = world.players.get(result.playerId);
  if (!player) throw new Error("Jogador não encontrado após entrar");
  return { player, link };
}

export function tickFor(world: World, ms: number): void {
  const ticks = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < ticks; i++) world.tick();
}

/** Avança a simulação até a condição ser verdadeira (ou falha após `maxMs`). */
export function tickUntil(world: World, condition: () => boolean, maxMs = 30_000): void {
  const ticks = Math.ceil(maxMs / TICK_MS);
  for (let i = 0; i < ticks; i++) {
    if (condition()) return;
    world.tick();
  }
  if (!condition()) throw new Error(`Condição não atingida em ${maxMs} ms`);
}

/**
 * Encontra o centro de uma área 5x5 totalmente livre (para jogadores e monstros)
 * dentro da zona pedida, a mais próxima possível da vila.
 */
export function findOpenSpot(world: World, zone: Zone): Point {
  const { map } = world;
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (let ty = 3; ty < map.height - 3; ty++) {
    for (let tx = 3; tx < map.width - 3; tx++) {
      const center = { x: tx + 0.5, y: ty + 0.5 };
      if (zoneAt(map, center.x, center.y) !== zone) continue;
      let open = true;
      for (let dy = -2; dy <= 2 && open; dy++) {
        for (let dx = -2; dx <= 2 && open; dx++) {
          if (!world.monsterWalk(tx + dx, ty + dy)) open = false;
        }
      }
      if (!open) continue;
      const d = Math.hypot(center.x - map.town.x, center.y - map.town.y);
      if (d < bestDistance) {
        best = center;
        bestDistance = d;
      }
    }
  }
  if (!best) throw new Error(`Nenhuma área livre na zona ${zone}`);
  return best;
}
