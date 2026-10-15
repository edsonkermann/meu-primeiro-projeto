import { TICK_MS } from "../shared/constants";
import type { EntityView, GameEvent, SelfState, ServerMessage } from "../shared/protocol";

/**
 * Atraso de interpolação: o cliente desenha o mundo ~110 ms "no passado" para
 * sempre ter dois snapshots entre os quais interpolar. Movimento fica suave
 * mesmo recebendo só 10 atualizações por segundo.
 */
const INTERPOLATION_DELAY = 110;
const SAMPLE_WINDOW = 1000;
/** Saltos maiores que isso (teleporte, renascer) não são interpolados. */
const SNAP_DISTANCE = 3;

interface Sample {
  t: number;
  x: number;
  y: number;
}

export interface ClientEntity {
  id: number;
  view: EntityView;
  samples: Sample[];
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  /** Momento (tempo do servidor) em que saiu do snapshot. */
  removedAt: number | null;
  /** Momentos (performance.now) de animações disparadas por eventos. */
  attackAt: number;
  hitAt: number;
  bornAt: number;
}

export class ClientState {
  youId = 0;
  self: SelfState | null = null;
  selfReceivedAt = 0;
  readonly entities = new Map<number, ClientEntity>();
  /** Entidades que acabaram de sair de cena: eventos atrasados ainda podem precisar delas. */
  private readonly recent = new Map<number, { entity: ClientEntity; until: number }>();
  private pending: { t: number; event: GameEvent }[] = [];
  private offset: number | null = null;

  /** Estimativa do relógio do servidor "agora", em ms. */
  serverNow(now: number): number {
    return now - (this.offset ?? now);
  }

  renderTime(now: number): number {
    return this.serverNow(now) - INTERPOLATION_DELAY;
  }

  applySelf(self: SelfState, now: number): void {
    this.self = self;
    this.selfReceivedAt = now;
  }

  /** Milissegundos restantes de uma recarga enviada pelo servidor. */
  cooldownLeft(cd: number, now: number): number {
    return Math.max(0, cd - (now - this.selfReceivedAt));
  }

  applySnapshot(snap: Extract<ServerMessage, { t: "snap" }>, now: number): void {
    const serverTime = snap.tick * TICK_MS;
    const sampleOffset = now - serverTime;
    // Guardamos o menor atraso visto (o pacote mais rápido) e deixamos derivar devagar.
    if (this.offset === null || Math.abs(sampleOffset - this.offset) > 3000) this.offset = sampleOffset;
    else if (sampleOffset < this.offset) this.offset = sampleOffset;
    else this.offset += (sampleOffset - this.offset) * 0.02;

    const seen = new Set<number>();
    for (const view of snap.ents) {
      seen.add(view.id);
      let entity = this.entities.get(view.id);
      if (!entity) {
        entity = {
          id: view.id,
          view,
          samples: [],
          x: view.x,
          y: view.y,
          facing: Math.PI / 2,
          moving: false,
          removedAt: null,
          attackAt: -1e9,
          hitAt: -1e9,
          bornAt: now,
        };
        this.entities.set(view.id, entity);
      }
      entity.view = view;
      entity.removedAt = null;
      entity.samples.push({ t: serverTime, x: view.x, y: view.y });
      while (entity.samples.length > 2 && (entity.samples[1] as Sample).t < serverTime - SAMPLE_WINDOW) {
        entity.samples.shift();
      }
    }
    for (const entity of this.entities.values()) {
      if (!seen.has(entity.id) && entity.removedAt === null) entity.removedAt = serverTime;
    }
    for (const event of snap.ev) this.pending.push({ t: serverTime, event });
  }

  /** Atualiza as posições interpoladas e devolve os eventos cujo momento já chegou. */
  update(now: number): GameEvent[] {
    const renderTime = this.renderTime(now);
    for (const [id, entry] of this.recent) if (entry.until < now) this.recent.delete(id);
    for (const entity of this.entities.values()) {
      if (entity.removedAt !== null && renderTime >= entity.removedAt) {
        this.entities.delete(entity.id);
        this.recent.set(entity.id, { entity, until: now + 1500 });
        continue;
      }
      const [x, y] = sampleAt(entity.samples, renderTime);
      const dx = x - entity.x;
      const dy = y - entity.y;
      entity.moving = Math.hypot(dx, dy) > 0.001;
      if (entity.moving) entity.facing = Math.atan2(dy, dx);
      entity.x = x;
      entity.y = y;
    }
    const due: GameEvent[] = [];
    while (this.pending.length > 0 && (this.pending[0] as { t: number }).t <= renderTime) {
      due.push((this.pending.shift() as { event: GameEvent }).event);
    }
    return due;
  }

  get selfEntity(): ClientEntity | undefined {
    return this.entities.get(this.youId);
  }

  /** Procura uma entidade visível ou que saiu de cena há pouco. */
  lookup(id: number): ClientEntity | undefined {
    return this.entities.get(id) ?? this.recent.get(id)?.entity;
  }
}

function sampleAt(samples: Sample[], t: number): [number, number] {
  const first = samples[0];
  if (!first) return [0, 0];
  if (t <= first.t) return [first.x, first.y];
  for (let i = samples.length - 1; i >= 1; i--) {
    const a = samples[i - 1] as Sample;
    const b = samples[i] as Sample;
    if (t < a.t) continue;
    if (t >= b.t) return [b.x, b.y];
    if (Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DISTANCE) return [a.x, a.y];
    const k = (t - a.t) / (b.t - a.t);
    return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
  }
  const last = samples[samples.length - 1] as Sample;
  return [last.x, last.y];
}
