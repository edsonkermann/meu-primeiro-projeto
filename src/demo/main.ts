import { startClient } from "../client/app";
import { MemoryStore, validateSave, type CharacterSave } from "../game/store";
import { World } from "../game/world";
import { DEFAULT_SEED, TICK_MS, TICK_RATE } from "../shared/constants";
import type { ClassId } from "../shared/data/classes";
import { LocalConnection } from "./localConnection";

/**
 * Demo offline: o mesmo código do servidor roda dentro da página, com alguns
 * jogadores simulados para o mundo parecer habitado.
 */

interface HotData {
  save?: unknown;
}

interface HotApi {
  ready?: (start: (data: HotData) => void) => void;
  data?: HotData;
  snapshot?: (provider: () => HotData) => void;
}

const BOTS: readonly [string, ClassId][] = [
  ["Aldric", "guerreiro"],
  ["Mirela", "arqueira"],
  ["Tobias", "mago"],
  ["Yara", "arqueira"],
];

function boot(data: HotData = {}): void {
  const store = new MemoryStore();
  const world = new World({
    store,
    seed: DEFAULT_SEED,
    motd: "Bem-vindo a Valdoria! Nesta demo o servidor roda no seu navegador e os outros heróis são bots.",
  });

  const save: CharacterSave | null = data.save ? validateSave(data.save) : null;
  if (save) void store.save(save);

  // Os bots entram e "jogam" alguns segundos antes de você chegar.
  void Promise.all(BOTS.map(([name, cls]) => world.addBot(name, cls))).then(() => {
    for (let i = 0; i < 20 * TICK_RATE; i++) world.tick();
    let last = performance.now();
    let accumulator = 0;
    window.setInterval(() => {
      const now = performance.now();
      accumulator += now - last;
      last = now;
      let steps = 0;
      while (accumulator >= TICK_MS && steps < 5) {
        world.tick();
        accumulator -= TICK_MS;
        steps++;
      }
      if (steps === 5) accumulator = 0;
    }, TICK_MS / 2);
  });

  let playerId: number | null = null;
  // Para depurar localmente: abra a demo com "?debug" e use `valdoria.world` no console.
  if (new URLSearchParams(window.location.search).has("debug")) {
    (window as unknown as { valdoria: unknown }).valdoria = { world, playerId: () => playerId };
  }
  const hot = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;
  try {
    hot?.snapshot?.(() => {
      const current = playerId !== null ? world.exportCharacter(playerId) : null;
      return current ? { save: current } : {};
    });
  } catch {
    // Sem suporte a atualização ao vivo: a demo funciona normalmente.
  }

  startClient({
    mode: "demo",
    connect: () => new LocalConnection(world),
    autoJoin: save ? { name: save.name, cls: save.cls } : null,
    onJoined: (id) => {
      playerId = id;
    },
  });
}

const hotApi = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;
if (hotApi?.ready) hotApi.ready(boot);
else boot(hotApi?.data ?? {});
