import { Client, EmbedBuilder } from "discord.js";
import { db } from "@workspace/db";
import {
  conquistasUsuarioTable,
  colecaoUsuarioTable,
  catalogoFigurinhasTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger.js";
import { getGuildEmojis, getConquistaEmoji, type GuildEmojis, type EmojiChave } from "./emoji-config.js";

export interface Conquista {
  id: string;
  nome: string;
  descricao: string;
  emojiKey: EmojiChave;
  cor: number;
}

export const CONQUISTAS: Record<string, Conquista> = {
  primeira_figurinha: {
    id: "primeira_figurinha",
    nome: "Primeira Figurinha!",
    descricao: "Desbloqueou sua primeira figurinha.",
    emojiKey: "conquista_primeira_figurinha",
    cor: 0x470f78,
  },
  dez_figurinhas: {
    id: "dez_figurinhas",
    nome: "Colecionador Iniciante",
    descricao: "Tem 10 figurinhas no álbum.",
    emojiKey: "conquista_dez_figurinhas",
    cor: 0x470f78,
  },
  vinte_cinco_figurinhas: {
    id: "vinte_cinco_figurinhas",
    nome: "Colecionador Dedicado",
    descricao: "Tem 25 figurinhas no álbum.",
    emojiKey: "conquista_vinte_cinco_figurinhas",
    cor: 0x470f78,
  },
  cinquenta_figurinhas: {
    id: "cinquenta_figurinhas",
    nome: "Colecionador Lendário",
    descricao: "Tem 50 figurinhas no álbum.",
    emojiKey: "conquista_cinquenta_figurinhas",
    cor: 0x470f78,
  },
  album_completo: {
    id: "album_completo",
    nome: "Álbum Completo!",
    descricao: "Coletou todas as figurinhas do catálogo.",
    emojiKey: "conquista_album_completo",
    cor: 0x470f78,
  },
  primeiro_pacote: {
    id: "primeiro_pacote",
    nome: "Primeiro Pacote",
    descricao: "Abriu seu primeiro pacotinho.",
    emojiKey: "conquista_primeiro_pacote",
    cor: 0x470f78,
  },
  sete_pacotes: {
    id: "sete_pacotes",
    nome: "Rotina Diária",
    descricao: "Abriu 7 pacotinhos ao longo dos dias.",
    emojiKey: "conquista_sete_pacotes",
    cor: 0x470f78,
  },
  trinta_pacotes: {
    id: "trinta_pacotes",
    nome: "Maratonista",
    descricao: "Abriu 30 pacotinhos.",
    emojiKey: "conquista_trinta_pacotes",
    cor: 0x470f78,
  },
  figurinha_lendaria: {
    id: "figurinha_lendaria",
    nome: "Sortudo!",
    descricao: "Ganhou uma figurinha Lendária.",
    emojiKey: "conquista_figurinha_lendaria",
    cor: 0x470f78,
  },
  rebirth_prata: {
    id: "rebirth_prata",
    nome: "Renascido — Prata",
    descricao: "Fez Rebirth para o nível Prata.",
    emojiKey: "conquista_rebirth_prata",
    cor: 0x470f78,
  },
  rebirth_ouro: {
    id: "rebirth_ouro",
    nome: "Renascido — Ouro",
    descricao: "Fez Rebirth para o nível Ouro.",
    emojiKey: "conquista_rebirth_ouro",
    cor: 0x470f78,
  },
  primeira_troca: {
    id: "primeira_troca",
    nome: "Negociante",
    descricao: "Completou sua primeira troca.",
    emojiKey: "conquista_primeira_troca",
    cor: 0x470f78,
  },
  cinco_trocas: {
    id: "cinco_trocas",
    nome: "Mercador",
    descricao: "Completou 5 trocas.",
    emojiKey: "conquista_cinco_trocas",
    cor: 0x470f78,
  },
};

export async function verificarConquistas(
  guildId: string,
  userId: string,
  username: string,
  contexto: {
    abreuPacote?: boolean;
    fezTroca?: boolean;
    figurinhasNovas?: { raridade: string }[];
  }
): Promise<Conquista[]> {
  try {
    const jaTemRows = await db
      .select({ conquistaId: conquistasUsuarioTable.conquistaId })
      .from(conquistasUsuarioTable)
      .where(and(eq(conquistasUsuarioTable.guildId, guildId), eq(conquistasUsuarioTable.userId, userId)));
    const jaTem = new Set(jaTemRows.map((r) => r.conquistaId));

    const novas: Conquista[] = [];

    const tentar = async (id: string) => {
      if (jaTem.has(id)) return;
      const conquista = CONQUISTAS[id];
      if (!conquista) return;
      try {
        await db.insert(conquistasUsuarioTable).values({ guildId, userId, username, conquistaId: id });
        novas.push(conquista);
        jaTem.add(id);
      } catch { /* race condition */ }
    };

    const [{ totalFig }] = await db
      .select({ totalFig: count() })
      .from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId)));

    const [{ totalCatalogo }] = await db
      .select({ totalCatalogo: count() })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    if (totalFig >= 1) await tentar("primeira_figurinha");
    if (totalFig >= 10) await tentar("dez_figurinhas");
    if (totalFig >= 25) await tentar("vinte_cinco_figurinhas");
    if (totalFig >= 50) await tentar("cinquenta_figurinhas");
    if (totalCatalogo > 0 && totalFig >= totalCatalogo) await tentar("album_completo");

    if (contexto.figurinhasNovas?.some((f) => f.raridade === "lendária")) await tentar("figurinha_lendaria");

    if (contexto.abreuPacote) {
      const pacotesAprox = Math.ceil(totalFig / 3);
      await tentar("primeiro_pacote");
      if (pacotesAprox >= 7) await tentar("sete_pacotes");
      if (pacotesAprox >= 30) await tentar("trinta_pacotes");
    }

    if (contexto.fezTroca) {
      await tentar("primeira_troca");
      const jaPrimeiraTroca = jaTem.has("primeira_troca") || novas.some((n) => n.id === "primeira_troca");
      if (jaPrimeiraTroca && !jaTem.has("cinco_trocas")) {
        const [{ totalTrocas }] = await db
          .select({ totalTrocas: count() })
          .from(conquistasUsuarioTable)
          .where(and(eq(conquistasUsuarioTable.guildId, guildId), eq(conquistasUsuarioTable.userId, userId), eq(conquistasUsuarioTable.conquistaId, "troca_realizada")));
        await db.insert(conquistasUsuarioTable).values({ guildId, userId, username, conquistaId: `troca_realizada_${Date.now()}` }).catch(() => {});
        if (totalTrocas >= 4) await tentar("cinco_trocas");
      }
    }

    return novas;
  } catch (err) {
    logger.error({ err }, "Erro ao verificar conquistas");
    return [];
  }
}

export async function anunciarConquistas(
  channelId: string,
  userId: string,
  novas: Conquista[],
  client: Client,
  guildId?: string
) {
  if (novas.length === 0) return;
  try {
    const emojis = guildId ? await getGuildEmojis(guildId) : null;
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    for (const conquista of novas) {
      const emoji = emojis ? getConquistaEmoji(emojis, conquista.id) : "🏅";
      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Conquista desbloqueada!`)
        .setDescription(`<@${userId}> desbloqueou **${conquista.nome}**!\n*${conquista.descricao}*`)
        .setColor(conquista.cor)
        .setTimestamp();
      await (channel as any).send({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err }, "Erro ao anunciar conquistas");
  }
}
