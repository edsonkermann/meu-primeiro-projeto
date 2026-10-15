# Valdoria: guia para sessões de desenvolvimento

Protótipo de MMORPG 2D original. Servidor autoritativo em Node.js + TypeScript (`ws`), cliente web em Canvas 2D, testes com Vitest, build com esbuild. O dono do projeto fala português: textos do jogo, comentários, commits e PRs são em português.

## Comandos

- `npm run dev`: cliente recompilando + servidor com recarga automática e 3 bots (http://localhost:3000)
- `npm run check`: typecheck (servidor e cliente) + testes + build. Rode antes de todo commit.
- `npm test`: só os testes
- `npm run build:demo`: gera `dist/demo/valdoria-demo.html` (demo offline em arquivo único)

## Arquitetura (regras que não devem ser quebradas)

- **O servidor é a fonte da verdade.** O cliente envia intenções; o servidor decide posição, dano, drops e XP. Nunca aceite valores calculados pelo cliente.
- **`src/shared` e `src/game` são puros**: nada de `node:*`, `fs`, `window` ou `document`. Eles rodam no servidor e na demo do navegador. Os dois `tsconfig` (server e client) incluem essas pastas para garantir isso.
- **Tempo da simulação**: use `world.time` (ms simulados), nunca `Date.now()` ou `performance.now()` na lógica do jogo. A única exceção é o `savedAt` do save.
- **Aleatoriedade**: use o `Rng` com seed do mundo, nunca `Math.random()` na lógica do jogo (efeitos visuais do cliente podem usar).
- **Protocolo** (`src/shared/protocol.ts`): toda mensagem nova do cliente precisa de validação em `parseClientMessage` e de teste em `test/protocol.test.ts`. Mudança incompatível: incremente `PROTOCOL_VERSION`.
- **Conteúdo em dados**: classes, monstros, itens e drops ficam em `src/shared/data`. Balanceamento se faz ali.
- **Persistência** passa pela interface `CharacterStore`. O formato do save tem `version`; ao mudar o formato, escreva a migração em `validateSave`.
- **Zona segura** é definida por tile (`isSafeTile`). Dentro da vila não há combate.

## Convenções

- TypeScript estrito. Sem `any`.
- Toda regra de jogo nova ou alterada ganha teste em `test/` (use `createTestWorld`, `joinPlayer`, `tickUntil` de `test/helpers.ts`, com `spawnMonsters: false` para cenários controlados).
- Commits pequenos, em português, com prefixo (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Mudanças entram na `main` por Pull Request.
- Interface do usuário: textos claros, sem jargão técnico. O HUD usa os tokens de cor de `src/client/style.css`.
- Arte é procedural (Canvas). Não adicione imagens, sons ou nomes de jogos comerciais: o repositório é público e o projeto é 100% original.

## Limitações conhecidas

- Login só por nome, sem senha: resolver antes de expor o servidor na internet.
- Salvamento em arquivos JSON (um processo só).
