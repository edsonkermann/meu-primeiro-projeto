import { NAME_PATTERN } from "../../shared/constants";
import { CLASSES, CLASS_IDS, type ClassId } from "../../shared/data/classes";
import { byId, create, storage } from "../dom";
import { drawPlayer } from "../render/sprites";
import { rangeLabel } from "./hud";

const STORAGE_NAME = "valdoria:nome";
const STORAGE_CLASS = "valdoria:classe";

/** Tela de título: escolha de nome e classe. */
export class LoginScreen {
  onSubmit: (name: string, cls: ClassId) => void = () => undefined;
  private readonly root = byId("title-screen");
  private readonly form = byId<HTMLFormElement>("login-form");
  private readonly nameInput = byId<HTMLInputElement>("login-name");
  private readonly hint = byId("login-hint");
  private readonly error = byId("login-error");
  private readonly submit = byId<HTMLButtonElement>("login-submit");
  private readonly cards = new Map<ClassId, HTMLLabelElement>();
  private selected: ClassId;

  constructor(mode: "online" | "demo") {
    const savedClass = storage.get(STORAGE_CLASS);
    this.selected = (CLASS_IDS as readonly string[]).includes(savedClass ?? "") ? (savedClass as ClassId) : "guerreiro";
    this.nameInput.value = storage.get(STORAGE_NAME) ?? "";

    const grid = byId("class-grid");
    for (const id of CLASS_IDS) {
      const def = CLASSES[id];
      const card = create("label", "class-card");
      const radio = create("input");
      radio.type = "radio";
      radio.name = "classe";
      radio.value = id;
      radio.id = `class-${id}`;
      radio.checked = id === this.selected;
      radio.addEventListener("change", () => this.select(id));

      const portrait = create("canvas", "class-portrait");
      portrait.width = 128;
      portrait.height = 128;
      portrait.setAttribute("aria-hidden", "true");
      const g = portrait.getContext("2d");
      if (g) {
        g.setTransform(100, 0, 0, 100, 64, 120);
        drawPlayer(g, id, { time: 0, facing: Math.PI / 2, moving: false, attack: -1, flash: 0, seed: 0 }, { self: false, dead: false });
      }

      const stats = create("dl", "class-stats");
      for (const [label, value] of [
        ["Vida", String(def.base.maxHp)],
        ["Ataque", `${def.base.attackMin}–${def.base.attackMax}`],
        ["Alcance", rangeLabel(def.attackRange)],
      ] as const) {
        const group = create("div", "class-stat");
        group.append(create("dt", undefined, label), create("dd", undefined, value));
        stats.append(group);
      }
      card.append(radio, portrait, create("span", "class-name", def.name), create("span", "class-tag", def.tagline), stats);
      card.title = def.description;
      grid.append(card);
      this.cards.set(id, card);
    }
    this.select(this.selected);

    byId("mode-note").textContent =
      mode === "demo"
        ? "Demonstração offline: o servidor do jogo roda dentro desta página, com jogadores simulados (bots). No jogo online, cada pessoa conectada é um jogador de verdade."
        : "Você está conectando ao servidor deste endereço. Seu progresso é salvo pelo nome do personagem.";

    this.nameInput.addEventListener("input", () => {
      this.nameInput.removeAttribute("aria-invalid");
      this.error.hidden = true;
    });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = this.nameInput.value.trim();
      if (!NAME_PATTERN.test(name)) {
        this.nameInput.setAttribute("aria-invalid", "true");
        this.showError("Use de 3 a 16 caracteres: letras sem acento, números ou _.");
        this.nameInput.focus();
        return;
      }
      storage.set(STORAGE_NAME, name);
      storage.set(STORAGE_CLASS, this.selected);
      this.onSubmit(name, this.selected);
    });
    this.hint.id = "login-hint";
    this.nameInput.setAttribute("aria-describedby", "login-hint");
  }

  private select(id: ClassId): void {
    this.selected = id;
    for (const [cardId, card] of this.cards) card.classList.toggle("is-selected", cardId === id);
  }

  /** Entra direto (usado quando a demo é recarregada com um personagem em andamento). */
  submitWith(name: string, cls: ClassId): void {
    this.nameInput.value = name;
    this.select(cls);
    this.onSubmit(name, cls);
  }

  setBusy(busy: boolean): void {
    this.submit.disabled = busy;
    this.submit.textContent = busy ? "Entrando..." : "Entrar no mundo";
  }

  showError(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  focus(): void {
    if (!this.nameInput.value) this.nameInput.focus();
  }
}
