import type { Renderer } from "./render/renderer";
import type { ClientEntity, ClientState } from "./state";

export interface InputActions {
  moveTo(x: number, y: number, showMarker: boolean, sx: number, sy: number): void;
  attack(entity: ClientEntity): void;
  skill(entity?: ClientEntity): void;
  pickup(entity: ClientEntity): void;
  potion(kind: "hp" | "mp"): void;
  toggleInventory(): void;
  focusChat(): void;
  cancel(): void;
  isTyping(): boolean;
}

const HOLD_REPEAT_MS = 140;

/**
 * Mouse, toque e teclado. Clicar no chão anda (segurar continua andando),
 * clicar num monstro ataca, num item coleta. Botão direito usa a habilidade.
 */
export class InputController {
  hoverId: number | null = null;
  private holding = false;
  private pointerX = 0;
  private pointerY = 0;
  private lastMoveSent = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly state: ClientState,
    private readonly actions: InputActions,
  ) {
    this.on(canvas, "pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.on(canvas, "pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.on(window, "pointerup", () => {
      this.holding = false;
    });
    this.on(window, "pointercancel", () => {
      this.holding = false;
    });
    this.on(canvas, "contextmenu", (event) => event.preventDefault());
    this.on(window, "keydown", (event) => this.onKey(event as KeyboardEvent));
  }

  private on(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  dispose(): void {
    for (const off of this.cleanup) off();
  }

  /** Chamado a cada quadro: continua andando enquanto o botão estiver pressionado. */
  update(now: number): void {
    if (!this.holding || now - this.lastMoveSent < HOLD_REPEAT_MS) return;
    this.lastMoveSent = now;
    const [wx, wy] = this.renderer.screenToWorld(this.pointerX, this.pointerY);
    this.actions.moveTo(wx, wy, false, this.pointerX, this.pointerY);
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 2) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    const target = this.renderer.pick(event.clientX, event.clientY, this.state);

    if (event.button === 2) {
      if (target?.view.k === "m") this.actions.skill(target);
      else this.actions.skill();
      return;
    }
    if (target?.view.k === "m") {
      this.actions.attack(target);
      return;
    }
    if (target?.view.k === "i") {
      this.actions.pickup(target);
      return;
    }
    const [wx, wy] = this.renderer.screenToWorld(event.clientX, event.clientY);
    this.actions.moveTo(wx, wy, true, event.clientX, event.clientY);
    this.holding = event.pointerType === "mouse";
    this.lastMoveSent = performance.now();
  }

  private onPointerMove(event: PointerEvent): void {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    if (event.pointerType !== "mouse") return;
    const target = this.renderer.pick(event.clientX, event.clientY, this.state);
    this.hoverId = target?.id ?? null;
    this.canvas.style.cursor = target && target.view.k !== "p" ? "pointer" : "default";
  }

  private onKey(event: KeyboardEvent): void {
    if (this.actions.isTyping() || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    switch (event.key.toLowerCase()) {
      case "1":
        this.actions.skill(this.hoverId !== null ? this.state.entities.get(this.hoverId) : undefined);
        break;
      case "q":
        this.actions.potion("hp");
        break;
      case "e":
        this.actions.potion("mp");
        break;
      case "i":
        this.actions.toggleInventory();
        break;
      case "enter":
        event.preventDefault();
        this.actions.focusChat();
        break;
      case "escape":
        this.actions.cancel();
        break;
      default:
        return;
    }
  }
}
