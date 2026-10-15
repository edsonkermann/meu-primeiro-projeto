import { describe, expect, it } from "vitest";
import { CHAT_MAX_LENGTH, MAX_MESSAGE_BYTES } from "../src/shared/constants";
import { parseClientMessage, sanitizeChat } from "../src/shared/protocol";

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe("validação de mensagens do cliente", () => {
  it("aceita mensagens válidas", () => {
    expect(parse({ t: "hello", v: 1, name: "Ana_01", cls: "mago" })).toEqual({ t: "hello", v: 1, name: "Ana_01", cls: "mago" });
    expect(parse({ t: "move", x: 10.5, y: 3 })).toEqual({ t: "move", x: 10.5, y: 3 });
    expect(parse({ t: "attack", id: 7 })).toEqual({ t: "attack", id: 7 });
    expect(parse({ t: "use", slot: 19 })).toEqual({ t: "use", slot: 19 });
    expect(parse({ t: "unequip", slot: "armor" })).toEqual({ t: "unequip", slot: "armor" });
    expect(parse({ t: "potion", kind: "mp" })).toEqual({ t: "potion", kind: "mp" });
    expect(parse({ t: "stop" })).toEqual({ t: "stop" });
  });

  it("descarta campos extras que o cliente tente injetar", () => {
    expect(parse({ t: "attack", id: 7, dmg: 99999 })).toEqual({ t: "attack", id: 7 });
  });

  it("recusa JSON inválido, tipos desconhecidos e formatos errados", () => {
    expect(parseClientMessage("{nao é json")).toBeNull();
    expect(parse([1, 2, 3])).toBeNull();
    expect(parse({ t: "teleport", x: 1, y: 1 })).toBeNull();
    expect(parse({ t: "move", x: "10", y: 1 })).toBeNull();
    expect(parse({ t: "move", x: 1e9, y: 1 })).toBeNull();
    expect(parseClientMessage('{"t":"move","x":NaN,"y":1}')).toBeNull();
    expect(parse({ t: "attack", id: -1 })).toBeNull();
    expect(parse({ t: "attack", id: 1.5 })).toBeNull();
    expect(parse({ t: "use", slot: 20 })).toBeNull();
    expect(parse({ t: "unequip", slot: "ring" })).toBeNull();
    expect(parse({ t: "potion", kind: "xp" })).toBeNull();
  });

  it("recusa nomes inválidos e classes inexistentes", () => {
    expect(parse({ t: "hello", v: 1, name: "ab", cls: "mago" })).toBeNull();
    expect(parse({ t: "hello", v: 1, name: "nome com espaço", cls: "mago" })).toBeNull();
    expect(parse({ t: "hello", v: 1, name: "<script>", cls: "mago" })).toBeNull();
    expect(parse({ t: "hello", v: 1, name: "Ana", cls: "paladino" })).toBeNull();
  });

  it("recusa mensagens grandes demais", () => {
    expect(parse({ t: "chat", text: "a".repeat(MAX_MESSAGE_BYTES) })).toBeNull();
    expect(parse({ t: "chat", text: "a".repeat(CHAT_MAX_LENGTH * 2 + 1) })).toBeNull();
  });
});

describe("sanitização do chat", () => {
  it("remove caracteres de controle e espaços repetidos", () => {
    const bell = String.fromCharCode(7);
    const zeroWidth = String.fromCharCode(0x200b);
    expect(sanitizeChat(`  oi ${bell}  pessoal${zeroWidth}!  `)).toBe("oi pessoal!");
  });

  it("limita o tamanho da mensagem", () => {
    expect(sanitizeChat("x".repeat(500))).toHaveLength(CHAT_MAX_LENGTH);
  });
});
