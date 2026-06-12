import { db } from "@workspace/db";
import { figurinhaConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const FIGURINHA_CONFIG_DEFAULTS = {
  troca_moedas_habilitado: "true",
  moedas_max_comum: "100",
  moedas_max_incomum: "250",
  moedas_max_rara: "600",
  moedas_max_epica: "1500",
  moedas_max_lendaria: "3000",
  cooldown_doacao_horas: "72",
  nivel_maximo_doacao: "0",
} as const;

export type FigurinhaConfigChave = keyof typeof FIGURINHA_CONFIG_DEFAULTS;

export type GuildFigurinhaConfig = {
  trocaMoedasHabilitado: boolean;
  moedasMaxComum: number;
  moedasMaxIncomum: number;
  moedasMaxRara: number;
  moedasMaxEpica: number;
  moedasMaxLendaria: number;
  cooldownDoacaoHoras: number;
  nivelMaximoDoacao: number;
};

export function getMoedasMaxPorRaridade(config: GuildFigurinhaConfig, raridade: string): number {
  switch (raridade) {
    case "comum": return config.moedasMaxComum;
    case "incomum": return config.moedasMaxIncomum;
    case "rara": return config.moedasMaxRara;
    case "épica": return config.moedasMaxEpica;
    case "lendária": return config.moedasMaxLendaria;
    default: return config.moedasMaxComum;
  }
}

const cache = new Map<string, { config: GuildFigurinhaConfig; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function getGuildFigurinhaConfig(guildId: string): Promise<GuildFigurinhaConfig> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && now - cached.ts < TTL) return cached.config;

  const rows = await db.select().from(figurinhaConfigTable).where(eq(figurinhaConfigTable.guildId, guildId));

  const raw: Record<string, string> = { ...FIGURINHA_CONFIG_DEFAULTS };
  for (const row of rows) {
    if (row.chave in raw) raw[row.chave] = row.valor;
  }

  const config: GuildFigurinhaConfig = {
    trocaMoedasHabilitado: raw["troca_moedas_habilitado"] !== "false",
    moedasMaxComum: Math.max(0, parseInt(raw["moedas_max_comum"] ?? "100", 10) || 100),
    moedasMaxIncomum: Math.max(0, parseInt(raw["moedas_max_incomum"] ?? "250", 10) || 250),
    moedasMaxRara: Math.max(0, parseInt(raw["moedas_max_rara"] ?? "600", 10) || 600),
    moedasMaxEpica: Math.max(0, parseInt(raw["moedas_max_epica"] ?? "1500", 10) || 1500),
    moedasMaxLendaria: Math.max(0, parseInt(raw["moedas_max_lendaria"] ?? "3000", 10) || 3000),
    cooldownDoacaoHoras: Math.max(1, parseInt(raw["cooldown_doacao_horas"] ?? "72", 10) || 72),
    nivelMaximoDoacao: parseInt(raw["nivel_maximo_doacao"] ?? "0", 10),
  };

  cache.set(guildId, { config, ts: now });
  return config;
}

export function invalidateFigurinhaCache(guildId: string): void {
  cache.delete(guildId);
  logger.info({ guildId }, "Cache de figurinha config invalidado");
}

export const FIGURINHA_CONFIG_NOMES: Record<FigurinhaConfigChave, string> = {
  troca_moedas_habilitado: "Moedas em trocas",
  moedas_max_comum: "Máx. moedas — Comum",
  moedas_max_incomum: "Máx. moedas — Incomum",
  moedas_max_rara: "Máx. moedas — Rara",
  moedas_max_epica: "Máx. moedas — Épica",
  moedas_max_lendaria: "Máx. moedas — Lendária",
  cooldown_doacao_horas: "Cooldown de doação (horas)",
  nivel_maximo_doacao: "Nível máx. para doação",
};
