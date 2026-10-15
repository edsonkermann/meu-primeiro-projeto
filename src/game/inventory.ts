import { INVENTORY_SIZE, MAX_STACK } from "../shared/constants";
import { ITEMS } from "../shared/data/items";
import type { InvSlot } from "../shared/protocol";

export type Inventory = (InvSlot | null)[];

export function createInventory(): Inventory {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

/**
 * Adiciona itens ao inventário: primeiro completa pilhas existentes, depois usa
 * espaços vazios. Retorna quantos itens NÃO couberam.
 */
export function addItem(inventory: Inventory, itemId: string, qty: number): number {
  const def = ITEMS[itemId];
  if (!def) throw new Error(`Item desconhecido: ${itemId}`);
  let left = qty;

  if (def.stackable) {
    for (const slot of inventory) {
      if (left <= 0) break;
      if (slot && slot.item === itemId && slot.qty < MAX_STACK) {
        const added = Math.min(left, MAX_STACK - slot.qty);
        slot.qty += added;
        left -= added;
      }
    }
  }

  for (let i = 0; i < inventory.length && left > 0; i++) {
    if (inventory[i] === null) {
      const added = def.stackable ? Math.min(left, MAX_STACK) : 1;
      inventory[i] = { item: itemId, qty: added };
      left -= added;
    }
  }
  return left;
}

export function removeFromSlot(inventory: Inventory, slot: number, qty = 1): void {
  const entry = inventory[slot];
  if (!entry) return;
  entry.qty -= qty;
  if (entry.qty <= 0) inventory[slot] = null;
}

export function findSlot(inventory: Inventory, predicate: (slot: InvSlot) => boolean): number {
  return inventory.findIndex((slot) => slot !== null && predicate(slot));
}

export function countItems(inventory: Inventory, predicate: (slot: InvSlot) => boolean): number {
  let total = 0;
  for (const slot of inventory) if (slot && predicate(slot)) total += slot.qty;
  return total;
}

export function cloneInventory(inventory: Inventory): Inventory {
  return inventory.map((slot) => (slot ? { ...slot } : null));
}
