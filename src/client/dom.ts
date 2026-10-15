/** Busca um elemento pelo id e falha cedo se o HTML estiver fora de sincronia com o código. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado`);
  return element as T;
}

export function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** localStorage pode não existir ou lançar erro (aba anônima, dados bloqueados). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // sem armazenamento: o jogo funciona igual, só não lembra a última escolha
    }
  },
};

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const UI_FONT = '"Alegreya Sans", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const DISPLAY_FONT = '"Grenze Gotisch", "Palatino Linotype", Georgia, serif';
