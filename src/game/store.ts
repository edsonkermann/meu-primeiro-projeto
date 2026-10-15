import { INVENTORY_SIZE, MAX_LEVEL, MAX_STACK, NAME_PATTERN } from "../shared/constants";
import { CLASS_IDS, type ClassId } from "../shared/data/classes";
import { ITEMS } from "../shared/data/items";
import type { EquipmentState } from "../shared/progression";
import type { InvSlot } from "../shared/protocol";

/** Formato do personagem salvo. O campo `version` permite migrar o formato no futuro. */
export interface CharacterSave {
  version: 1;
  name: string;
  cls: ClassId;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  gold: number;
  inventory: (InvSlot | null)[];
  equipment: EquipmentState;
  x: number;
  y: number;
  savedAt: number;
}

/**
 * Onde os personagens ficam guardados. O servidor usa arquivos JSON; a demo no
 * navegador usa memória. Trocar por um banco de dados é implementar esta interface.
 */
export interface CharacterStore {
  load(name: string): Promise<CharacterSave | null>;
  save(character: CharacterSave): Promise<void>;
}

export class MemoryStore implements CharacterStore {
  private readonly data = new Map<string, string>();

  async load(name: string): Promise<CharacterSave | null> {
    const raw = this.data.get(name.toLowerCase());
    return raw ? validateSave(JSON.parse(raw)) : null;
  }

  async save(character: CharacterSave): Promise<void> {
    this.data.set(character.name.toLowerCase(), JSON.stringify(character));
  }
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Valida um personagem lido do disco. Arquivo corrompido ou editado à mão não
 * pode derrubar o servidor nem criar itens inexistentes.
 */
export function validateSave(raw: unknown): CharacterSave | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  if (typeof r.name !== "string" || !NAME_PATTERN.test(r.name)) return null;
  if (typeof r.cls !== "string" || !(CLASS_IDS as readonly string[]).includes(r.cls)) return null;
  if (!isInt(r.level, 1, MAX_LEVEL) || !isInt(r.xp, 0, 1e9) || !isInt(r.gold, 0, 1e9)) return null;
  if (!isInt(r.hp, 0, 1e6) || !isInt(r.mp, 0, 1e6) || !isNum(r.x) || !isNum(r.y)) return null;
  if (!Array.isArray(r.inventory)) return null;

  const inventory: (InvSlot | null)[] = Array.from({ length: INVENTORY_SIZE }, () => null);
  r.inventory.slice(0, INVENTORY_SIZE).forEach((slot: unknown, i) => {
    if (typeof slot !== "object" || slot === null) return;
    const s = slot as Record<string, unknown>;
    const def = typeof s.item === "string" ? ITEMS[s.item] : undefined;
    if (!def || def.kind === "gold" || !isInt(s.qty, 1, MAX_STACK)) return;
    inventory[i] = { item: def.id, qty: def.stackable ? s.qty : 1 };
  });

  const eq = (r.equipment ?? {}) as Record<string, unknown>;
  const weaponDef = typeof eq.weapon === "string" ? ITEMS[eq.weapon] : undefined;
  const armorDef = typeof eq.armor === "string" ? ITEMS[eq.armor] : undefined;
  const equipment: EquipmentState = {
    weapon: weaponDef?.kind === "weapon" ? weaponDef.id : null,
    armor: armorDef?.kind === "armor" ? armorDef.id : null,
  };

  return {
    version: 1,
    name: r.name,
    cls: r.cls as ClassId,
    level: r.level,
    xp: r.xp,
    hp: r.hp,
    mp: r.mp,
    gold: r.gold,
    inventory,
    equipment,
    x: r.x,
    y: r.y,
    savedAt: isNum(r.savedAt) ? r.savedAt : 0,
  };
}
