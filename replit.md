# Álbum de Figurinhas — Discord Bot

Bot do Discord para colecionar figurinhas com fotos, álbum por usuário e sistema de trocas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Discord bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — código do bot do Discord
- `artifacts/api-server/src/bot/commands/` — um arquivo por comando slash
- `artifacts/api-server/src/bot/index.ts` — inicialização do cliente Discord
- `artifacts/api-server/src/bot/deploy-commands.ts` — registro de comandos slash via REST
- `lib/db/src/schema/figurinhas.ts` — tabelas `figurinhas` e `albums`

## Bot Commands

| Comando | Descrição |
|---|---|
| `/adicionar-figurinha` | Envia foto + título para adicionar ao álbum |
| `/ver-album` | Navega pelas figurinhas com paginação (botões) |
| `/figurinhas` | Lista todas as figurinhas em texto com contagem por raridade |
| `/dar-figurinha` | Transfere uma figurinha para outro usuário |
| `/repetidas` | Mostra figurinhas repetidas (detectadas pelo título) |
| `/ranking` | Top 10 colecionadores do servidor |
| `/remover-figurinha` | Remove uma figurinha do álbum pelo número |

## Architecture decisions

- O bot roda no mesmo processo do servidor Express — sem processo separado
- Comandos slash são registrados globalmente no startup via REST API (propagação em até 1h)
- Figurinhas repetidas são detectadas automaticamente por título duplicado no mesmo álbum
- Imagens são armazenadas como URL do Discord (CDN) — sem upload próprio
- Cada guild tem seu próprio álbum isolado

## Product

Bot do Discord para criar um álbum de figurinhas colaborativo em servidores. Cada usuário pode adicionar fotos com título e raridade, navegar pelo álbum, dar figurinhas para amigos e competir no ranking.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Comandos slash globais levam até 1 hora para aparecer em todos os servidores após o primeiro registro
- Para registro instantâneo em um servidor específico, usar `Routes.applicationGuildCommands(clientId, guildId)` em vez de `Routes.applicationCommands(clientId)`
- URLs de imagem do Discord CDN podem expirar — considerar armazenar o conteúdo em object storage para produção

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
