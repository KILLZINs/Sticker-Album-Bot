import type { Client } from "discord.js";
import { logger } from "./logger.js";

interface RefreshResponse {
  refreshed_urls: Array<{ original: string; refreshed: string }>;
}

/**
 * Chama o endpoint POST /attachments/refresh-urls do Discord para renovar
 * URLs expiradas da CDN (formato ?ex=...&is=...&hm=...).
 * Retorna um Map original → renovada. Em caso de falha retorna Map vazio
 * (o chamador deve usar as URLs originais como fallback).
 */
export async function refreshAttachmentUrls(
  client: Client,
  urls: string[],
): Promise<Map<string, string>> {
  const toRefresh = urls.filter(
    (u) => u && u.includes("cdn.discordapp.com") && u.includes("?ex="),
  );

  if (toRefresh.length === 0) return new Map();

  try {
    const result = (await client.rest.post("/attachments/refresh-urls", {
      body: { attachment_ids: toRefresh },
    })) as RefreshResponse;

    const map = new Map<string, string>();
    for (const { original, refreshed } of result.refreshed_urls) {
      map.set(original, refreshed);
    }
    logger.info({ count: map.size }, "[refresh-attachments] URLs renovadas");
    return map;
  } catch (err) {
    logger.warn({ err }, "[refresh-attachments] falha ao renovar URLs — usando originais");
    return new Map();
  }
}

export function applyRefresh(
  url: string | null,
  refreshMap: Map<string, string>,
): string | null {
  if (!url) return null;
  return refreshMap.get(url) ?? url;
}
