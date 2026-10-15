import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSave, type CharacterSave, type CharacterStore } from "../game/store";

/**
 * Salva cada personagem em um arquivo JSON dentro de `dir`.
 * A escrita é atômica (arquivo temporário + rename): se o servidor cair no meio,
 * o save anterior continua intacto. Saves do mesmo personagem são enfileirados.
 */
export class FileStore implements CharacterStore {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly dir: string) {}

  private fileFor(name: string): string {
    return path.join(this.dir, `${encodeURIComponent(name.toLowerCase())}.json`);
  }

  async load(name: string): Promise<CharacterSave | null> {
    try {
      const raw = await readFile(this.fileFor(name), "utf8");
      return validateSave(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  save(character: CharacterSave): Promise<void> {
    const key = character.name.toLowerCase();
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        const file = this.fileFor(character.name);
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(character, null, 2), "utf8");
        await rename(temp, file);
      });
    this.queues.set(key, next);
    void next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }).catch(() => undefined);
    return next;
  }
}
