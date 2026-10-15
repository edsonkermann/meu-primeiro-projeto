import { INVENTORY_SIZE, POTION_COOLDOWN_MS } from "../../shared/constants";
import { CLASSES, type ClassId } from "../../shared/data/classes";
import { ITEMS, RARITY_COLORS, RARITY_NAMES, type ItemDef } from "../../shared/data/items";
import { ZONE_HINTS, ZONE_NAMES, type Zone } from "../../shared/map";
import type { DerivedStats } from "../../shared/progression";
import type { EquipSlot, MessageTone, SelfState } from "../../shared/protocol";
import { byId, create } from "../dom";
import { drawBagIcon, drawSkillIcon } from "../render/sprites";
import { paintCanvas, paintItemCanvas } from "./icons";

export interface HudActions {
  useSlot(slot: number): void;
  unequip(slot: EquipSlot): void;
  skill(): void;
  potion(kind: "hp" | "mp"): void;
  chat(text: string): void;
}

interface SlotView {
  button: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  qty: HTMLElement;
  key: string;
}

const KIND_LABELS: Record<ItemDef["kind"], string> = {
  gold: "Moeda",
  potion: "Poção",
  weapon: "Arma",
  armor: "Armadura",
};

export function rangeLabel(range: number): string {
  return range < 2 ? "corpo a corpo" : `${range} casas`;
}

/** Interface sobre o jogo: barras, ações, inventário, chat, avisos. Só exibe; quem decide é o servidor. */
export class Hud {
  private readonly root = byId("hud");
  private readonly nameEl = byId("hud-name");
  private readonly levelEl = byId("hud-level");
  private readonly classEl = byId("hud-class");
  private readonly hpFill = byId("hud-hp-fill");
  private readonly hpText = byId("hud-hp-text");
  private readonly mpFill = byId("hud-mp-fill");
  private readonly mpText = byId("hud-mp-text");
  private readonly xpFill = byId("hud-xp-fill");
  private readonly xpText = byId("hud-xp-text");
  private readonly goldEl = byId("hud-gold");
  private readonly zoneName = byId("zone-name");
  private readonly zoneHint = byId("zone-hint");
  private readonly chatPanel = byId("chat");
  private readonly chatLog = byId<HTMLOListElement>("chat-log");
  private readonly chatForm = byId<HTMLFormElement>("chat-form");
  private readonly chatInput = byId<HTMLInputElement>("chat-input");
  private readonly skillBtn = byId<HTMLButtonElement>("act-skill");
  private readonly hpBtn = byId<HTMLButtonElement>("act-hp");
  private readonly mpBtn = byId<HTMLButtonElement>("act-mp");
  private readonly invBtn = byId<HTMLButtonElement>("act-inv");
  private readonly chatBtn = byId<HTMLButtonElement>("act-chat");
  private readonly skillCost = byId("skill-cost");
  private readonly hpCount = byId("hp-count");
  private readonly mpCount = byId("mp-count");
  private readonly inventory = byId("inventory");
  private readonly invGrid = byId("inv-grid");
  private readonly invStats = byId("inv-stats");
  private readonly eqWeapon = byId<HTMLButtonElement>("eq-weapon");
  private readonly eqArmor = byId<HTMLButtonElement>("eq-armor");
  private readonly tooltip = byId("tooltip");
  private readonly toasts = byId("toasts");
  private readonly banner = byId("banner");
  private readonly death = byId("death");
  private readonly deathTimer = byId("death-timer");
  private readonly netPill = byId("net-pill");
  private readonly slots: SlotView[] = [];
  private readonly equipKeys: Record<EquipSlot, string> = { weapon: "?", armor: "?" };
  private self: SelfState | null = null;
  private selfAt = 0;
  private skillClass: ClassId | null = null;
  private zone: Zone | null = null;
  private tooltipOwner: HTMLElement | null = null;

  constructor(private readonly actions: HudActions) {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const button = create("button", "slot is-empty");
      button.type = "button";
      button.id = `inv-slot-${i}`;
      button.setAttribute("aria-label", `Espaço ${i + 1} vazio`);
      const canvas = create("canvas");
      canvas.width = 88;
      canvas.height = 88;
      canvas.setAttribute("aria-hidden", "true");
      const qty = create("span", "slot-qty");
      button.append(canvas, qty);
      button.addEventListener("click", () => this.actions.useSlot(i));
      const show = () => this.showSlotTooltip(i, button);
      button.addEventListener("pointerenter", show);
      button.addEventListener("focus", show);
      button.addEventListener("pointerleave", () => this.hideTooltip(button));
      button.addEventListener("blur", () => this.hideTooltip(button));
      this.invGrid.append(button);
      this.slots.push({ button, canvas, qty, key: "" });
    }
    for (const [button, slot] of [
      [this.eqWeapon, "weapon"],
      [this.eqArmor, "armor"],
    ] as const) {
      button.addEventListener("click", () => this.actions.unequip(slot));
      const show = () => this.showEquipTooltip(slot, button);
      button.addEventListener("pointerenter", show);
      button.addEventListener("focus", show);
      button.addEventListener("pointerleave", () => this.hideTooltip(button));
      button.addEventListener("blur", () => this.hideTooltip(button));
    }

    this.skillBtn.addEventListener("click", () => this.actions.skill());
    this.hpBtn.addEventListener("click", () => this.actions.potion("hp"));
    this.mpBtn.addEventListener("click", () => this.actions.potion("mp"));
    this.invBtn.addEventListener("click", () => this.toggleInventory());
    byId("inv-close").addEventListener("click", () => this.toggleInventory(false));
    this.chatBtn.addEventListener("click", () => this.toggleChat());
    this.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) this.actions.chat(text);
      this.chatInput.value = "";
      this.chatInput.blur();
    });
    this.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.chatInput.blur();
      event.stopPropagation();
    });

    const potionCanvas = (button: HTMLButtonElement) => button.querySelector("canvas") as HTMLCanvasElement;
    paintItemCanvas(potionCanvas(this.hpBtn), ITEMS.pocao_vida_p ?? null, 0.66);
    paintItemCanvas(potionCanvas(this.mpBtn), ITEMS.pocao_mana ?? null, 0.66);
    paintCanvas(potionCanvas(this.invBtn), drawBagIcon, 0.66);
  }

  show(): void {
    this.root.hidden = false;
    // A dica de controles some sozinha depois de um tempo para não poluir a tela.
    window.setTimeout(() => this.root.classList.add("hints-done"), 45_000);
  }

  isTyping(): boolean {
    return document.activeElement === this.chatInput;
  }

  focusChat(): void {
    if (window.getComputedStyle(this.chatPanel).display === "none") this.toggleChat(true);
    this.chatInput.focus();
  }

  toggleChat(force?: boolean): void {
    const open = force ?? !this.root.classList.contains("chat-open");
    this.root.classList.toggle("chat-open", open);
    this.chatBtn.setAttribute("aria-expanded", String(open));
  }

  get inventoryOpen(): boolean {
    return this.inventory.hidden === false;
  }

  toggleInventory(force?: boolean): void {
    const open = force ?? !this.inventoryOpen;
    this.inventory.hidden = !open;
    this.root.classList.toggle("inv-open", open);
    this.invBtn.setAttribute("aria-expanded", String(open));
    if (!open) this.hideTooltip();
  }

  setSelf(self: SelfState, now: number): void {
    this.self = self;
    this.selfAt = now;
    const cls = CLASSES[self.cls];
    this.nameEl.textContent = self.name;
    this.levelEl.textContent = `Nv ${self.level}`;
    this.classEl.textContent = cls.name;
    this.setBar(this.hpFill, this.hpText, self.hp, self.stats.maxHp);
    this.setBar(this.mpFill, this.mpText, self.mp, self.stats.maxMp);
    if (self.xpNext > 0) {
      this.setBar(this.xpFill, this.xpText, self.xp, self.xpNext);
      (this.xpFill.parentElement as HTMLElement).title = `Experiência: ${self.xp} de ${self.xpNext}`;
    } else {
      this.setBar(this.xpFill, this.xpText, 1, 1);
      (this.xpFill.parentElement as HTMLElement).title = "Nível máximo";
    }
    this.goldEl.textContent = self.gold.toLocaleString("pt-BR");

    if (this.skillClass !== self.cls) {
      this.skillClass = self.cls;
      paintCanvas(this.skillBtn.querySelector("canvas") as HTMLCanvasElement, (g) => drawSkillIcon(g, cls.skill.effect, cls.accent), 0.72);
      this.skillBtn.title = `${cls.skill.name}: ${cls.skill.description} Custa ${cls.skill.mpCost} de mana. (tecla 1 ou botão direito)`;
      (this.skillBtn.querySelector(".sr-only") as HTMLElement).textContent = `Usar ${cls.skill.name}`;
      this.skillCost.textContent = String(cls.skill.mpCost);
    }

    let hp = 0;
    let mp = 0;
    for (const slot of self.inventory) {
      const def = slot ? ITEMS[slot.item] : undefined;
      if (def?.heal) hp += slot?.qty ?? 0;
      if (def?.mana) mp += slot?.qty ?? 0;
    }
    this.hpCount.textContent = String(hp);
    this.mpCount.textContent = String(mp);
    this.hpBtn.classList.toggle("is-disabled", hp === 0);
    this.mpBtn.classList.toggle("is-disabled", mp === 0);
    this.hpBtn.title = hp > 0 ? `Poção de vida (${hp}) · tecla Q` : "Sem poções de vida";
    this.mpBtn.title = mp > 0 ? `Poção de mana (${mp}) · tecla E` : "Sem poções de mana";

    self.inventory.forEach((slot, i) => this.renderSlot(i, slot?.item ?? null, slot?.qty ?? 0));
    this.renderEquip("weapon", this.eqWeapon, self.equipment.weapon);
    this.renderEquip("armor", this.eqArmor, self.equipment.armor);
    this.renderStats(self.stats);
    if (this.tooltipOwner && !this.tooltip.hidden) this.tooltipOwner.dispatchEvent(new Event("pointerenter"));
  }

  update(now: number): void {
    const self = this.self;
    if (!self) return;
    const elapsed = now - this.selfAt;
    const cls = CLASSES[self.cls];
    const skillLeft = Math.max(0, self.skillCd - elapsed);
    this.setCooldown(this.skillBtn, skillLeft / cls.skill.cooldownMs);
    this.skillBtn.classList.toggle("is-disabled", self.mp < cls.skill.mpCost);
    const potionLeft = Math.max(0, self.potionCd - elapsed) / POTION_COOLDOWN_MS;
    this.setCooldown(this.hpBtn, potionLeft);
    this.setCooldown(this.mpBtn, potionLeft);
    this.death.hidden = !self.dead;
    if (self.dead) this.deathTimer.textContent = String(Math.max(0, Math.ceil((self.respawnIn - elapsed) / 1000)));
  }

  setZone(zone: Zone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    this.zoneName.textContent = ZONE_NAMES[zone];
    this.zoneHint.textContent = ZONE_HINTS[zone];
  }

  setNet(text: string): void {
    this.netPill.textContent = text;
  }

  addChat(from: string, text: string, system: boolean, isSelf: boolean): void {
    const nearBottom = this.chatLog.scrollHeight - this.chatLog.scrollTop - this.chatLog.clientHeight < 24;
    const item = create("li");
    if (system) {
      item.className = "chat-sys";
      item.textContent = text;
    } else {
      item.append(create("span", `chat-from${isSelf ? " is-self" : ""}`, `${from}: `), document.createTextNode(text));
    }
    this.chatLog.append(item);
    while (this.chatLog.children.length > 60) this.chatLog.firstElementChild?.remove();
    if (nearBottom) this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  toast(text: string, tone: MessageTone): void {
    const toast = create("div", `toast toast-${tone}`, text);
    this.toasts.append(toast);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

  showBanner(title: string, subtitle: string): void {
    const banner = this.banner;
    banner.hidden = true;
    banner.replaceChildren(document.createTextNode(title), create("small", undefined, subtitle));
    void banner.offsetWidth; // reinicia a animação
    banner.hidden = false;
    window.setTimeout(() => {
      banner.hidden = true;
    }, 2700);
  }

  private setBar(fill: HTMLElement, text: HTMLElement, value: number, max: number): void {
    fill.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
    text.textContent = `${value} / ${max}`;
  }

  private setCooldown(button: HTMLButtonElement, ratio: number): void {
    const element = button.querySelector(".action-cd") as HTMLElement | null;
    element?.style.setProperty("--cd", ratio > 0 ? ratio.toFixed(3) : "0");
  }

  private renderSlot(index: number, itemId: string | null, qty: number): void {
    const view = this.slots[index];
    if (!view) return;
    const key = itemId ? `${itemId}:${qty}` : "";
    if (view.key === key) return;
    view.key = key;
    const def = itemId ? (ITEMS[itemId] ?? null) : null;
    paintItemCanvas(view.canvas, def);
    view.qty.textContent = def && qty > 1 ? String(qty) : "";
    view.button.classList.toggle("is-empty", !def);
    view.button.style.setProperty("--rarity", def ? RARITY_COLORS[def.rarity] : "");
    view.button.setAttribute("aria-label", def ? `${def.name}${qty > 1 ? `, ${qty} unidades` : ""}` : `Espaço ${index + 1} vazio`);
    const self = this.self;
    const locked = Boolean(
      def && self && (def.levelReq > self.level || (def.classReq !== null && def.classReq !== self.cls)),
    );
    view.button.classList.toggle("is-locked", locked);
  }

  private renderEquip(slot: EquipSlot, button: HTMLButtonElement, itemId: string | null): void {
    const key = itemId ?? "";
    if (this.equipKeys[slot] === key) return;
    this.equipKeys[slot] = key;
    const def = itemId ? (ITEMS[itemId] ?? null) : null;
    paintItemCanvas(button.querySelector("canvas") as HTMLCanvasElement, def, 0.72);
    button.style.setProperty("--rarity", def ? RARITY_COLORS[def.rarity] : "");
    const label = slot === "weapon" ? "Arma" : "Armadura";
    button.setAttribute("aria-label", def ? `${label}: ${def.name}. Clique para desequipar.` : `${label}: vazio`);
  }

  private renderStats(stats: DerivedStats): void {
    const rows: [string, string][] = [
      ["Ataque", `${stats.attackMin}–${stats.attackMax}`],
      ["Defesa", String(stats.defense)],
      ["Crítico", `${Math.round(stats.critChance * 100)}%`],
      ["Alcance", rangeLabel(stats.attackRange)],
    ];
    this.invStats.replaceChildren(...rows.flatMap(([label, value]) => [create("dt", undefined, label), create("dd", undefined, value)]));
  }

  private showSlotTooltip(index: number, anchor: HTMLElement): void {
    const slot = this.self?.inventory[index];
    const def = slot ? ITEMS[slot.item] : undefined;
    if (!def || !slot) {
      this.hideTooltip();
      return;
    }
    this.showTooltip(def, slot.qty, anchor, def.kind === "potion" ? "Clique para usar" : "Clique para equipar");
  }

  private showEquipTooltip(slot: EquipSlot, anchor: HTMLElement): void {
    const itemId = this.self?.equipment[slot];
    const def = itemId ? ITEMS[itemId] : undefined;
    if (!def) {
      this.hideTooltip();
      return;
    }
    this.showTooltip(def, 1, anchor, "Clique para desequipar");
  }

  private showTooltip(def: ItemDef, qty: number, anchor: HTMLElement, hint: string): void {
    const self = this.self;
    const title = create("h3", undefined, qty > 1 ? `${def.name} (${qty})` : def.name);
    title.style.color = RARITY_COLORS[def.rarity];
    const parts: HTMLElement[] = [title, create("p", "tt-meta", `${RARITY_NAMES[def.rarity]} · ${KIND_LABELS[def.kind]}`)];
    if (def.levelReq > 1) {
      parts.push(create("p", self && self.level < def.levelReq ? "tt-bad" : "tt-meta", `Requer nível ${def.levelReq}`));
    }
    if (def.classReq) {
      parts.push(create("p", self && self.cls !== def.classReq ? "tt-bad" : "tt-meta", `Exclusivo para ${CLASSES[def.classReq].name}`));
    }
    const b = def.bonus;
    if (b) {
      if (b.attackMin || b.attackMax) parts.push(create("p", "tt-bonus", `+${b.attackMin ?? 0}–${b.attackMax ?? 0} de ataque`));
      if (b.defense) parts.push(create("p", "tt-bonus", `+${b.defense} de defesa`));
      if (b.maxHp) parts.push(create("p", "tt-bonus", `+${b.maxHp} de vida máxima`));
      if (b.maxMp) parts.push(create("p", "tt-bonus", `+${b.maxMp} de mana máxima`));
      if (b.critChance) parts.push(create("p", "tt-bonus", `+${Math.round(b.critChance * 100)}% de chance de crítico`));
    }
    parts.push(create("p", undefined, def.description), create("p", "tt-meta", hint));
    this.tooltip.replaceChildren(...parts);
    this.tooltip.hidden = false;
    this.tooltipOwner = anchor;

    const rect = anchor.getBoundingClientRect();
    const box = this.tooltip.getBoundingClientRect();
    let left = rect.left - box.width - 10;
    if (left < 8) left = Math.min(window.innerWidth - box.width - 8, rect.right + 10);
    const top = Math.max(8, Math.min(window.innerHeight - box.height - 8, rect.top));
    this.tooltip.style.left = `${Math.max(8, left)}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hideTooltip(owner?: HTMLElement): void {
    if (owner && owner !== this.tooltipOwner) return;
    this.tooltip.hidden = true;
    this.tooltipOwner = null;
  }
}
