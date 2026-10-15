import { DEFAULT_SEED, PROTOCOL_VERSION } from "../shared/constants";
import { CLASSES, type ClassId } from "../shared/data/classes";
import { MONSTERS } from "../shared/data/monsters";
import { generateMap, zoneAt } from "../shared/map";
import type { ClientMessage, GameEvent, ServerMessage } from "../shared/protocol";
import { byId, prefersReducedMotion } from "./dom";
import { InputController } from "./input";
import type { Connection } from "./net";
import { Renderer } from "./render/renderer";
import { ClientState, type ClientEntity } from "./state";
import { Hud } from "./ui/hud";
import { LoginScreen } from "./ui/login";
import { Minimap } from "./ui/minimap";

export interface ClientOptions {
  mode: "online" | "demo";
  connect: () => Connection;
  /** Entra direto com este personagem (demo recarregada com progresso em andamento). */
  autoJoin?: { name: string; cls: ClassId } | null;
  /** Avisado quando o jogador entra no mundo. */
  onJoined?: (playerId: number) => void;
}

/** Ponto de entrada do cliente: tela de título, conexão e o laço de desenho. */
export function startClient(options: ClientOptions): void {
  document.documentElement.lang = "pt-BR";
  const canvas = byId<HTMLCanvasElement>("world");
  const renderer = new Renderer(canvas, generateMap(DEFAULT_SEED));
  const reducedMotion = prefersReducedMotion();
  const login = new LoginScreen(options.mode);
  let session: GameSession | null = null;

  window.addEventListener("resize", () => renderer.resize());

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (session) session.frame(now, dt);
    else renderer.drawBackdrop(now, dt, reducedMotion);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);

  login.onSubmit = (name, cls) => {
    login.setBusy(true);
    const connection = options.connect();
    let joined = false;
    connection.onOpen = () => connection.send({ t: "hello", v: PROTOCOL_VERSION, name, cls });
    connection.onMessage = (message) => {
      if (joined) {
        session?.handle(message);
        return;
      }
      if (message.t === "err") {
        login.showError(message.msg);
        login.setBusy(false);
        connection.close();
      } else if (message.t === "welcome") {
        joined = true;
        session = new GameSession(connection, renderer, message, options.mode, reducedMotion);
        login.hide();
        options.onJoined?.(message.you);
      }
    };
    connection.onClose = (reason) => {
      if (!joined) {
        login.showError(reason);
        login.setBusy(false);
        return;
      }
      session?.disconnected(reason);
    };
  };

  if (options.autoJoin) login.submitWith(options.autoJoin.name, options.autoJoin.cls);
  else login.focus();
}

/** Uma partida em andamento: recebe mensagens, toca eventos e desenha. */
class GameSession {
  private readonly state = new ClientState();
  private readonly hud: Hud;
  private readonly input: InputController;
  private readonly minimap: Minimap;
  private readonly map;
  private targetId: number | null = null;
  private pingTimer = 0;
  private lastTargetSent = 0;

  constructor(
    private readonly connection: Connection,
    private readonly renderer: Renderer,
    welcome: Extract<ServerMessage, { t: "welcome" }>,
    mode: "online" | "demo",
    private readonly reducedMotion: boolean,
  ) {
    this.state.youId = welcome.you;
    this.map = generateMap(welcome.seed, welcome.w, welcome.h);
    renderer.setMap(this.map);
    this.minimap = new Minimap(byId<HTMLCanvasElement>("minimap"), this.map);
    this.hud = new Hud({
      useSlot: (slot) => this.send({ t: "use", slot }),
      unequip: (slot) => this.send({ t: "unequip", slot }),
      skill: () => this.useSkill(),
      potion: (kind) => this.send({ t: "potion", kind }),
      chat: (text) => this.send({ t: "chat", text }),
    });
    this.input = new InputController(byId<HTMLCanvasElement>("world"), renderer, this.state, {
      moveTo: (x, y, marker, sx, sy) => {
        this.targetId = null;
        this.send({ t: "move", x, y });
        if (marker) this.renderer.clickMarker(sx, sy, performance.now());
      },
      attack: (entity) => this.attack(entity),
      skill: (entity) => this.useSkill(entity),
      pickup: (entity) => {
        this.targetId = null;
        this.send({ t: "pickup", id: entity.id });
      },
      potion: (kind) => this.send({ t: "potion", kind }),
      toggleInventory: () => this.hud.toggleInventory(),
      focusChat: () => this.hud.focusChat(),
      cancel: () => {
        if (this.hud.inventoryOpen) this.hud.toggleInventory(false);
        else {
          this.targetId = null;
          this.send({ t: "stop" });
        }
      },
      isTyping: () => this.hud.isTyping(),
    });
    this.hud.show();
    this.hud.addChat("", welcome.motd, true, false);
    if (mode === "demo") {
      this.hud.setNet("Demo offline");
    } else {
      this.hud.setNet("Conectado");
      this.pingTimer = window.setInterval(() => this.send({ t: "ping", n: performance.now() }), 2000);
    }
    byId("disc-back").addEventListener("click", () => window.location.reload());
  }

  private send(message: ClientMessage): void {
    this.connection.send(message);
  }

  private attack(entity: ClientEntity): void {
    this.targetId = entity.id;
    const now = performance.now();
    if (now - this.lastTargetSent < 120) return;
    this.lastTargetSent = now;
    this.send({ t: "attack", id: entity.id });
  }

  private useSkill(entity?: ClientEntity): void {
    const target = entity?.view.k === "m" ? entity : this.targetId !== null ? this.state.entities.get(this.targetId) : undefined;
    if (!target || target.view.k !== "m") {
      this.hud.toast("Escolha um monstro como alvo para usar a habilidade.", "info");
      return;
    }
    this.targetId = target.id;
    this.send({ t: "skill", id: target.id });
  }

  handle(message: ServerMessage): void {
    const now = performance.now();
    switch (message.t) {
      case "snap":
        this.state.applySnapshot(message, now);
        break;
      case "self":
        this.state.applySelf(message.s, now);
        this.hud.setSelf(message.s, now);
        break;
      case "chat":
        this.hud.addChat(message.from, message.text, message.sys, message.from === this.state.self?.name);
        break;
      case "pong":
        this.hud.setNet(`${Math.round(now - message.n)} ms`);
        break;
      case "err":
        this.hud.toast(message.msg, "warn");
        break;
      case "welcome":
        break;
    }
  }

  frame(now: number, dt: number): void {
    for (const event of this.state.update(now)) this.play(event, now);
    if (this.targetId !== null && !this.state.entities.has(this.targetId)) this.targetId = null;
    this.input.update(now);
    this.renderer.draw({ state: this.state, now, dt, targetId: this.targetId, hoverId: this.input.hoverId }, this.reducedMotion);
    this.hud.update(now);
    const me = this.state.selfEntity;
    if (me) this.hud.setZone(zoneAt(this.map, me.x, me.y));
    const [x0, y0] = this.renderer.screenToWorld(0, 0);
    const [x1, y1] = this.renderer.screenToWorld(this.renderer.cssW, this.renderer.cssH);
    this.minimap.draw(this.state, now, { x0, y0, x1, y1 });
  }

  disconnected(reason: string): void {
    window.clearInterval(this.pingTimer);
    this.input.dispose();
    byId("disc-reason").textContent = reason;
    byId("disconnected").hidden = false;
  }

  /** Transforma eventos do servidor em efeitos visuais e avisos. */
  private play(event: GameEvent, now: number): void {
    const effects = this.renderer.effects;
    const you = this.state.youId;
    switch (event.e) {
      case "hit": {
        const src = this.state.lookup(event.src);
        const dst = this.state.lookup(event.dst);
        if (src) {
          src.attackAt = now;
          if (!src.moving) src.facing = Math.atan2(event.y - src.y, event.x - src.x);
        }
        if (dst) dst.hitAt = now;
        if (src && (event.kind === "arrow" || event.kind === "orb")) {
          const color = src.view.k === "p" ? CLASSES[src.view.cls].accent : "#ffffff";
          effects.projectile(src.x, src.y - 0.45, event.x, event.y - 0.4, event.kind, color, now);
        } else if (event.kind === "slash") {
          effects.ring(event.x, event.y, 0.6, "slash", "#ffd27a", now, 380);
        } else if (event.kind === "melee") {
          effects.ring(event.x, event.y, 0.42, "slash", "#fff2d6", now, 260);
        } else if (event.kind === "monster") {
          effects.ring(event.x, event.y, 0.4, "impact", "#ff7a5c", now, 300);
        }
        const mine = event.src === you;
        const onMe = event.dst === you;
        const color = onMe ? "#ff6b5a" : event.crit ? "#ffd166" : mine ? "#ffffff" : "#d9d2c3";
        const size = onMe || mine ? (event.crit ? 26 : 19) : 13;
        effects.text(event.x, event.y - 0.9, event.crit ? `${event.dmg}!` : String(event.dmg), color, now, size);
        break;
      }
      case "immune": {
        const dst = this.state.lookup(event.dst);
        if (dst) effects.text(dst.x, dst.y - 0.9, "Imune", "#c9cfd6", now, 14, 800);
        break;
      }
      case "aoe":
        effects.ring(event.x, event.y, event.r, event.fx === "arrows" ? "rain" : "arcane", event.fx === "arrows" ? "#f5e7c4" : "#b48cff", now, 650);
        break;
      case "die": {
        const entity = this.state.lookup(event.id);
        if (entity?.view.k === "m") {
          effects.corpse(event.x, event.y, MONSTERS[entity.view.mid], entity.facing, now, entity.id);
        }
        if (event.id === this.targetId) this.targetId = null;
        break;
      }
      case "heal": {
        const entity = this.state.lookup(event.id);
        if (!entity) break;
        if (event.hp > 0) effects.text(entity.x, entity.y - 1.0, `+${event.hp}`, "#6fe08a", now, 18);
        if (event.mp > 0) effects.text(entity.x + 0.3, entity.y - 0.8, `+${event.mp}`, "#7ab4ff", now, 16);
        effects.ring(entity.x, entity.y, 0.4, "heal", event.hp > 0 ? "#8ff0a4" : "#9cc7ff", now, 700);
        break;
      }
      case "lvl": {
        const entity = this.state.lookup(event.id);
        if (entity) {
          effects.ring(entity.x, entity.y, 0.5, "level", "#ebc777", now, 1400);
          effects.text(entity.x, entity.y - 1.3, `Nível ${event.lvl}!`, "#ebc777", now, event.id === you ? 22 : 15, 1600);
        }
        if (event.id === you) this.hud.showBanner(`Nível ${event.lvl}`, "Vida, mana e ataque aumentaram");
        break;
      }
      case "xp": {
        const me = this.state.selfEntity;
        if (me) effects.text(me.x + 0.95, me.y - 0.75, `+${event.amount} XP`, "#c4a8ff", now, 14, 1100);
        break;
      }
      case "msg":
        this.hud.toast(event.text, event.tone);
        break;
    }
  }
}
