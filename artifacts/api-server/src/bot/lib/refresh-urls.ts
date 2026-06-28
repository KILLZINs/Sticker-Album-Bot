import type { REST } from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

type RefreshResult = {
  refreshed_urls: Array<{ original: string; refreshed: string }>;
};

/** Verifica se uma URL do Discord CDN está expirada pelo campo `ex=` (hex timestamp). */
export function isDiscordUrlExpired(url: string): boolean {
  try {
    const u = new URL(url);
    const exHex = u.searchParams.get("ex");
    if (!exHex) return false;
    return Math.floor(Date.now() / 1000) > parseInt(exHex, 16);
  } catch {
    return false;
  }
}

export function isDiscordCdnUrl(url: string): boolean {
  return url.includes("cdn.discordapp.com") || url.includes("media.discordapp.net");
}

/** Chama a API do Discord para renovar URLs expiradas em lote. */
async function refreshDiscordUrls(rest: REST, urls: string[]): Promise<Map<string, string>> {
  if (urls.length === 0) return new Map();
  try {
    const result = (await rest.post("/attachments/refresh-urls", {
      body: { attachment_urls: urls },
    })) as RefreshResult;
    const map = new Map<string, string>();
    for (const entry of result.refreshed_urls ?? []) {
      if (entry.original && entry.refreshed) map.set(entry.original, entry.refreshed);
    }
    return map;
  } catch (err) {
    logger.warn({ err }, "Falha ao renovar URLs do Discord CDN");
    return new Map();
  }
}

/**
 * Verifica se a URL de uma figurinha está expirada.
 * Se sim, renova via API e salva a nova URL no banco.
 * Retorna sempre a URL mais fresca disponível.
 */
export async function getRefreshedImageUrl(
  rest: REST,
  catalogoId: number,
  currentUrl: string
): Promise<string> {
  if (!isDiscordCdnUrl(currentUrl) || !isDiscordUrlExpired(currentUrl)) return currentUrl;

  const refreshed = await refreshDiscordUrls(rest, [currentUrl]);
  const newUrl = refreshed.get(currentUrl);
  if (!newUrl || newUrl === currentUrl) return currentUrl;

  await db
    .update(catalogoFigurinhasTable)
    .set({ imageUrl: newUrl })
    .where(eq(catalogoFigurinhasTable.id, catalogoId))
    .catch((err) => logger.warn({ err, catalogoId }, "Falha ao atualizar URL no banco"));

  logger.info({ catalogoId }, "URL do Discord renovada com sucesso");
  return newUrl;
}

/**
 * Renova em lote todas as URLs expiradas de uma lista de figurinhas.
 * Retorna um Map<id, url> com as URLs atualizadas.
 */
export async function batchRefreshImageUrls(
  rest: REST,
  items: Array<{ id: number; url: string }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>(items.map((i) => [i.id, i.url]));

  const expired = items.filter(
    (i) => isDiscordCdnUrl(i.url) && isDiscordUrlExpired(i.url)
  );
  if (expired.length === 0) return result;

  const refreshMap = await refreshDiscordUrls(rest, expired.map((i) => i.url));

  for (const item of expired) {
    const newUrl = refreshMap.get(item.url);
    if (newUrl && newUrl !== item.url) {
      result.set(item.id, newUrl);
      await db
        .update(catalogoFigurinhasTable)
        .set({ imageUrl: newUrl })
        .where(eq(catalogoFigurinhasTable.id, item.id))
        .catch((err) => logger.warn({ err, id: item.id }, "Falha ao atualizar URL no banco"));
    }
  }

  if (expired.length > 0) {
    logger.info({ count: expired.length }, "URLs do Discord renovadas em lote");
  }
  return result;
}

/**
 * Varre todo o catálogo de um servidor e renova URLs expiradas.
 * Chamado periodicamente pelo bot para manutenção proativa.
 */
export async function refreshExpiredUrlsInGuild(rest: REST, guildId: string): Promise<void> {
  try {
    const catalogo = await db
      .select({ id: catalogoFigurinhasTable.id, imageUrl: catalogoFigurinhasTable.imageUrl })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    const expired = catalogo.filter(
      (f) => isDiscordCdnUrl(f.imageUrl) && isDiscordUrlExpired(f.imageUrl)
    );
    if (expired.length === 0) return;

    logger.info({ guildId, count: expired.length }, "URLs expiradas encontradas — renovando...");
    await batchRefreshImageUrls(rest, expired.map((f) => ({ id: f.id, url: f.imageUrl })));
  } catch (err) {
    logger.warn({ err, guildId }, "Erro ao renovar URLs expiradas do servidor");
  }
}
