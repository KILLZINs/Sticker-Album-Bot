import { db } from "@workspace/db";
import { moedaConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const MOEDA_DEFAULTS = {
  nome_moeda: "moedas",
  moedas_por_mensagem: "2",
  comprimento_min_mensagem: "5",
  preco_standard: "300",
  preco_deluxe: "500",
  preco_ultimate: "1000",
} as const;

export type MoedaChave = keyof typeof MOEDA_DEFAULTS;

export type GuildMoedaConfig = {
  nomeMoeda: string;
  moedasPorMensagem: number;
  comprimentoMinMensagem: number;
  precoStandard: number;
  precoDeluxe: number;
  precoUltimate: number;
};

const cache = new Map<string, { config: GuildMoedaConfig; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function getGuildMoedaConfig(guildId: string): Promise<GuildMoedaConfig> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && now - cached.ts < TTL) return cached.config;

  const rows = await db
    .select()
    .from(moedaConfigTable)
    .where(eq(moedaConfigTable.guildId, guildId));

  const raw: Record<string, string> = { ...MOEDA_DEFAULTS };
  for (const row of rows) {
    if (row.chave in raw) raw[row.chave] = row.valor;
  }

  const config: GuildMoedaConfig = {
    nomeMoeda: raw["nome_moeda"] ?? MOEDA_DEFAULTS.nome_moeda,
    moedasPorMensagem: Math.max(1, parseInt(raw["moedas_por_mensagem"] ?? "2", 10) || 2),
    comprimentoMinMensagem: Math.max(1, parseInt(raw["comprimento_min_mensagem"] ?? "5", 10) || 5),
    precoStandard: Math.max(1, parseInt(raw["preco_standard"] ?? "300", 10) || 300),
    precoDeluxe: Math.max(1, parseInt(raw["preco_deluxe"] ?? "500", 10) || 500),
    precoUltimate: Math.max(1, parseInt(raw["preco_ultimate"] ?? "1000", 10) || 1000),
  };

  cache.set(guildId, { config, ts: now });
  return config;
}

export function invalidateMoedaCache(guildId: string): void {
  cache.delete(guildId);
  logger.info({ guildId }, "Cache de moeda config invalidado");
}

export const MOEDA_NOMES: Record<MoedaChave, string> = {
  nome_moeda: "Nome da Moeda",
  moedas_por_mensagem: "Ganho por mensagem",
  comprimento_min_mensagem: "Mínimo de caracteres por mensagem",
  preco_standard: "Preço Pacote Standard",
  preco_deluxe: "Preço Pacote Deluxe",
  preco_ultimate: "Preço Pacote Ultimate",
};
