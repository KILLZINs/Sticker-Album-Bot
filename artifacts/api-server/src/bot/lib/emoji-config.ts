import { db } from "@workspace/db";
import { emojiConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const EMOJI_DEFAULTS = {
  // Economia
  moedas: "🪙",
  // Pacotes
  pacote_standard: "📦",
  pacote_deluxe: "🎁",
  pacote_ultimate: "⭐",
  // Raridades
  raridade_comum: "⚪",
  raridade_incomum: "🟢",
  raridade_rara: "🔵",
  raridade_epica: "🟣",
  raridade_lendaria: "🌟",
  // Níveis de Rebirth
  nivel_normal: "✨",
  nivel_prata: "🥈",
  nivel_ouro: "🥇",
  // Ranking — top 3
  ranking_primeiro: "🥇",
  ranking_segundo: "🥈",
  ranking_terceiro: "🥉",
  // Conquistas
  conquista_primeira_figurinha: "🐣",
  conquista_dez_figurinhas: "📚",
  conquista_vinte_cinco_figurinhas: "🎖️",
  conquista_cinquenta_figurinhas: "💎",
  conquista_album_completo: "👑",
  conquista_primeiro_pacote: "📦",
  conquista_sete_pacotes: "📅",
  conquista_trinta_pacotes: "🏃",
  conquista_figurinha_lendaria: "🌟",
  conquista_rebirth_prata: "🥈",
  conquista_rebirth_ouro: "🥇",
  conquista_primeira_troca: "🔄",
  conquista_cinco_trocas: "🤝",
} as const;

export type EmojiChave = keyof typeof EMOJI_DEFAULTS;
export type GuildEmojis = Record<EmojiChave, string>;

export const NIVEL_NOME_TEXTO = ["Normal", "Prata", "Ouro"] as const;

const cache = new Map<string, { emojis: GuildEmojis; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function getGuildEmojis(guildId: string): Promise<GuildEmojis> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && now - cached.ts < TTL) return cached.emojis;

  try {
    const rows = await db.select().from(emojiConfigTable).where(eq(emojiConfigTable.guildId, guildId));
    const emojis = { ...EMOJI_DEFAULTS } as GuildEmojis;
    for (const row of rows) {
      if (row.chave in emojis) (emojis as Record<string, string>)[row.chave] = row.emoji;
    }
    cache.set(guildId, { emojis, ts: now });
    return emojis;
  } catch (err) {
    logger.warn({ err, guildId }, "Erro ao carregar emojis do DB, usando padrão");
    return { ...EMOJI_DEFAULTS } as GuildEmojis;
  }
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

export function getNivelEmoji(emojis: GuildEmojis, nivel: number): string {
  const chaves: EmojiChave[] = ["nivel_normal", "nivel_prata", "nivel_ouro"];
  const chave = chaves[nivel];
  return chave ? emojis[chave] : "✨";
}

export function getNivelDisplay(emojis: GuildEmojis, nivel: number): string {
  const texto = NIVEL_NOME_TEXTO[nivel] ?? "Normal";
  return `${getNivelEmoji(emojis, nivel)} ${texto}`;
}

export function getRankingMedal(emojis: GuildEmojis, pos: number): string {
  if (pos === 0) return emojis.ranking_primeiro;
  if (pos === 1) return emojis.ranking_segundo;
  if (pos === 2) return emojis.ranking_terceiro;
  return `**${pos + 1}.**`;
}

export function getConquistaEmoji(emojis: GuildEmojis, conquistaId: string): string {
  const chave = `conquista_${conquistaId}` as EmojiChave;
  return (chave in emojis) ? emojis[chave] : "🏅";
}

export function invalidateGuildCache(guildId: string): void {
  cache.delete(guildId);
  logger.info({ guildId }, "Cache de emojis invalidado");
}
