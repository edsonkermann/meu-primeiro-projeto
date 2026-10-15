/**
 * Constantes do jogo compartilhadas entre servidor e cliente.
 * Alterar valores aqui muda o comportamento dos dois lados ao mesmo tempo.
 */

export const GAME_NAME = "Valdoria";

/** Incrementar sempre que o formato das mensagens mudar de forma incompatível. */
export const PROTOCOL_VERSION = 1;

/** A simulação roda a 20 ticks por segundo (50 ms por tick). */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

/** Um snapshot do mundo é enviado a cada 2 ticks (10 por segundo). */
export const SNAPSHOT_EVERY_TICKS = 2;

/**
 * Área de interesse: o servidor só envia ao jogador as entidades dentro deste
 * retângulo (metade da largura/altura, em tiles). Economiza banda e dificulta
 * trapaças do tipo "ver o mapa inteiro".
 */
export const VIEW_HALF_WIDTH = 22;
export const VIEW_HALF_HEIGHT = 14;

export const MAP_WIDTH = 96;
export const MAP_HEIGHT = 96;
export const DEFAULT_SEED = 20261015;

export const MAX_LEVEL = 20;
export const INVENTORY_SIZE = 20;
export const MAX_STACK = 99;

export const PICKUP_RANGE = 1.25;
/** Tempo em que o item dropado fica reservado para quem causou mais dano. */
export const LOOT_PROTECTION_MS = 15_000;
export const GROUND_ITEM_TTL_MS = 60_000;
export const RESPAWN_DELAY_MS = 5_000;
export const POTION_COOLDOWN_MS = 1_500;
/** Sem receber ou causar dano por este tempo, o personagem regenera vida. */
export const OUT_OF_COMBAT_MS = 5_000;
/** Fração da experiência do nível perdida ao morrer. */
export const DEATH_XP_PENALTY = 0.05;
export const AUTOSAVE_INTERVAL_MS = 30_000;

export const CHAT_MAX_LENGTH = 120;
/** Nomes: 3 a 16 caracteres, apenas letras sem acento, números e "_". */
export const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

/** Tamanho máximo de uma mensagem do cliente. Qualquer coisa maior é descartada. */
export const MAX_MESSAGE_BYTES = 1024;
