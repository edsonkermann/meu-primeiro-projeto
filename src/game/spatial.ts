interface Positioned {
  id: number;
  x: number;
  y: number;
}

/**
 * Grade espacial: divide o mundo em células para encontrar rapidamente quem
 * está perto de quem. É a base do "gerenciamento de área de interesse".
 */
export class SpatialGrid<T extends Positioned> {
  private readonly cells = new Map<number, Set<T>>();
  private readonly cellOf = new Map<number, number>();

  constructor(private readonly cellSize = 8) {}

  private key(cx: number, cy: number): number {
    return (cy + 1024) * 4096 + (cx + 1024);
  }

  private keyFor(x: number, y: number): number {
    return this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  insert(entity: T): void {
    const key = this.keyFor(entity.x, entity.y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(entity);
    this.cellOf.set(entity.id, key);
  }

  remove(entity: T): void {
    const key = this.cellOf.get(entity.id);
    if (key === undefined) return;
    const cell = this.cells.get(key);
    cell?.delete(entity);
    if (cell && cell.size === 0) this.cells.delete(key);
    this.cellOf.delete(entity.id);
  }

  /** Chamar depois de mover a entidade. Só faz trabalho se ela trocou de célula. */
  update(entity: T): void {
    const key = this.keyFor(entity.x, entity.y);
    const current = this.cellOf.get(entity.id);
    if (current === key) return;
    if (current !== undefined) this.remove(entity);
    this.insert(entity);
  }

  has(entity: T): boolean {
    return this.cellOf.has(entity.id);
  }

  queryRect(x0: number, y0: number, x1: number, y1: number, visit: (entity: T) => void): void {
    const cx0 = Math.floor(x0 / this.cellSize);
    const cy0 = Math.floor(y0 / this.cellSize);
    const cx1 = Math.floor(x1 / this.cellSize);
    const cy1 = Math.floor(y1 / this.cellSize);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const entity of cell) {
          if (entity.x >= x0 && entity.x <= x1 && entity.y >= y0 && entity.y <= y1) visit(entity);
        }
      }
    }
  }
}
