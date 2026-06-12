import { db } from "@workspace/db";
import { emojiConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const EMOJI_DEFAULTS = {
  moedas: "🪙",
  pacote_standard: "📦",
  pacote_deluxe: "🎁",
  pacote_ultimate: "⭐",
  raridade_comum: "⚪",
  raridade_incomum: "🟢",
  raridade_rara: "🔵",
  raridade_epica: "🟣",
  raridade_lendaria: "🌟",
} as const;

export type EmojiChave = keyof typeof EMOJI_DEFAULTS;
export type GuildEmojis = Record<EmojiChave, string>;

const cache = new Map<string, { emojis: GuildEmojis; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function getGuildEmojis(guildId: string): Promise<GuildEmojis> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && now - cached.ts < TTL) return cached.emojis;

  const rows = await db
    .select()
    .from(emojiConfigTable)
    .where(eq(emojiConfigTable.guildId, guildId));

  const emojis = { ...EMOJI_DEFAULTS } as GuildEmojis;
  for (const row of rows) {
    if (row.chave in emojis) {
      (emojis as Record<string, string>)[row.chave] = row.emoji;
    }
  }

  cache.set(guildId, { emojis, ts: now });
  return emojis;
}

export function getRaridadeEmoji(emojis: GuildEmojis, raridade: string): string {
  const map: Record<string, EmojiChave> = {
    comum: "raridade_comum",
    incomum: "raridade_incomum",
    rara: "raridade_rara",
    "épica": "raridade_epica",
    "lendária": "raridade_lendaria",
  };
  const chave = map[raridade];
  return chave ? emojis[chave] : "⚪";
}

export function invalidateGuildCache(guildId: string): void {
  cache.delete(guildId);
  logger.info({ guildId }, "Cache de emojis invalidado");
}
