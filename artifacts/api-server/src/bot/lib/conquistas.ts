import { Client, EmbedBuilder } from "discord.js";
import { getGuildEmojis, getConquistaEmoji } from "./emoji-config.js";
import { db } from "@workspace/db";
import {
  conquistasUsuarioTable,
  colecaoUsuarioTable,
  pacotesDiariosTable,
  catalogoFigurinhasTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "./logger.js";

export interface Conquista {
  id: string;
  nome: string;
  descricao: string;
  emoji: string;
  cor: number;
}

export const CONQUISTAS: Record<string, Conquista> = {
  primeira_figurinha: {
    id: "primeira_figurinha",
    nome: "Primeira Figurinha!",
    descricao: "Desbloqueou sua primeira figurinha.",
    emoji: "🐣",
    cor: 0x470f78,
  },
  dez_figurinhas: {
    id: "dez_figurinhas",
    nome: "Colecionador Iniciante",
    descricao: "Tem 10 figurinhas no álbum.",
    emoji: "📚",
    cor: 0x470f78,
  },
  vinte_cinco_figurinhas: {
    id: "vinte_cinco_figurinhas",
    nome: "Colecionador Dedicado",
    descricao: "Tem 25 figurinhas no álbum.",
    emoji: "🎖️",
    cor: 0x470f78,
  },
  cinquenta_figurinhas: {
    id: "cinquenta_figurinhas",
    nome: "Colecionador Lendário",
    descricao: "Tem 50 figurinhas no álbum.",
    emoji: "💎",
    cor: 0x470f78,
  },
  album_completo: {
    id: "album_completo",
    nome: "Álbum Completo!",
    descricao: "Coletou todas as figurinhas do catálogo.",
    emoji: "👑",
    cor: 0x470f78,
  },
  primeiro_pacote: {
    id: "primeiro_pacote",
    nome: "Primeiro Pacote",
    descricao: "Abriu seu primeiro pacotinho.",
    emoji: "📦",
    cor: 0x470f78,
  },
  sete_pacotes: {
    id: "sete_pacotes",
    nome: "Rotina Diária",
    descricao: "Abriu 7 pacotinhos ao longo dos dias.",
    emoji: "📅",
    cor: 0x470f78,
  },
  trinta_pacotes: {
    id: "trinta_pacotes",
    nome: "Maratonista",
    descricao: "Abriu 30 pacotinhos.",
    emoji: "🏃",
    cor: 0x470f78,
  },
  figurinha_lendaria: {
    id: "figurinha_lendaria",
    nome: "Sortudo!",
    descricao: "Ganhou uma figurinha Lendária.",
    emoji: "🌟",
    cor: 0x470f78,
  },
  rebirth_prata: {
    id: "rebirth_prata",
    nome: "Renascido — Prata",
    descricao: "Fez Rebirth para o nível Prata.",
    emoji: "🥈",
    cor: 0x470f78,
  },
  rebirth_ouro: {
    id: "rebirth_ouro",
    nome: "Renascido — Ouro",
    descricao: "Fez Rebirth para o nível Ouro.",
    emoji: "🥇",
    cor: 0x470f78,
  },
  primeira_troca: {
    id: "primeira_troca",
    nome: "Negociante",
    descricao: "Completou sua primeira troca.",
    emoji: "🔄",
    cor: 0x470f78,
  },
  cinco_trocas: {
    id: "cinco_trocas",
    nome: "Mercador",
    descricao: "Completou 5 trocas.",
    emoji: "🤝",
    cor: 0x470f78,
  },
};

// Chama esta função após qualquer ação relevante do usuário.
// Retorna lista das novas conquistas ganhas (para anunciar).
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
    // Buscar conquistas já desbloqueadas
    const jaTemRows = await db
      .select({ conquistaId: conquistasUsuarioTable.conquistaId })
      .from(conquistasUsuarioTable)
      .where(
        and(
          eq(conquistasUsuarioTable.guildId, guildId),
          eq(conquistasUsuarioTable.userId, userId)
        )
      );
    const jaTem = new Set(jaTemRows.map((r) => r.conquistaId));

    const novas: Conquista[] = [];

    // Helper para tentar desbloquear uma conquista
    const tentar = async (id: string) => {
      if (jaTem.has(id)) return;
      const conquista = CONQUISTAS[id];
      if (!conquista) return;
      try {
        await db.insert(conquistasUsuarioTable).values({
          guildId,
          userId,
          username,
          conquistaId: id,
        });
        novas.push(conquista);
        jaTem.add(id);
      } catch {
        // Já tem (race condition) — ignorar
      }
    };

    // Contar figurinhas atuais
    const [{ totalFig }] = await db
      .select({ totalFig: count() })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId)
        )
      );

    // Contar total no catálogo
    const [{ totalCatalogo }] = await db
      .select({ totalCatalogo: count() })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    // Verificar conquistas de figurinhas
    if (totalFig >= 1) await tentar("primeira_figurinha");
    if (totalFig >= 10) await tentar("dez_figurinhas");
    if (totalFig >= 25) await tentar("vinte_cinco_figurinhas");
    if (totalFig >= 50) await tentar("cinquenta_figurinhas");
    if (totalCatalogo > 0 && totalFig >= totalCatalogo) await tentar("album_completo");

    // Verificar figurinha lendária
    if (contexto.figurinhasNovas?.some((f) => f.raridade === "lendária")) {
      await tentar("figurinha_lendaria");
    }

    // Verificar pacotes
    if (contexto.abreuPacote) {
      // Contar total de pacotes abertos rastreando via campo histórico
      // Usamos total de figurinhas como proxy: cada pacote dá 3, mas para precisão
      // vamos contar registros históricos de pacotes — por isso adicionamos um campo total
      // Aproximação: total de figurinhas / 3 (arredondado para cima)
      const pacotesAprox = Math.ceil(totalFig / 3);
      await tentar("primeiro_pacote");
      if (pacotesAprox >= 7) await tentar("sete_pacotes");
      if (pacotesAprox >= 30) await tentar("trinta_pacotes");
    }

    // Verificar trocas
    if (contexto.fezTroca) {
      // Contar conquistas de troca já existentes para saber quantas trocas fez
      const trocasConquistas = jaTemRows.filter(
        (r) => r.conquistaId === "primeira_troca" || r.conquistaId === "cinco_trocas"
      );

      await tentar("primeira_troca");

      // Proxy: se já tem primeira_troca + fez nova troca, checar 5
      // Guardamos número de trocas em memória via conquista especial "troca_N"
      // Solução simples: cada troca ganha uma "troca_count_N" — mas isso é complexo.
      // Alternativa: usar campo total de trocas via tabela de conquistas contagem
      // Por ora: verificar apenas se já tem primeira_troca (proxy de 5 trocas = tem ambas)
      const jaPrimeiraTroca = jaTem.has("primeira_troca") || novas.some((n) => n.id === "primeira_troca");
      if (jaPrimeiraTroca && !jaTem.has("cinco_trocas")) {
        // Contar trocas via conquistas especiais de contagem
        const [{ totalTrocas }] = await db
          .select({ totalTrocas: count() })
          .from(conquistasUsuarioTable)
          .where(
            and(
              eq(conquistasUsuarioTable.guildId, guildId),
              eq(conquistasUsuarioTable.userId, userId),
              eq(conquistasUsuarioTable.conquistaId, "troca_realizada")
            )
          );

        // Registrar esta troca como contador
        await db.insert(conquistasUsuarioTable).values({
          guildId,
          userId,
          username,
          conquistaId: `troca_realizada_${Date.now()}`,
        }).catch(() => {});

        if (totalTrocas >= 4) await tentar("cinco_trocas");
      }
    }

    return novas;
  } catch (err) {
    logger.error({ err }, "Erro ao verificar conquistas");
    return [];
  }
}

// Anunciar conquistas no canal onde o comando foi usado
export async function anunciarConquistas(
  channelId: string,
  userId: string,
  novas: Conquista[],
  client: Client,
  guildId?: string
) {
  if (novas.length === 0) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const emojis = guildId ? await getGuildEmojis(guildId).catch(() => null) : null;

    for (const conquista of novas) {
      const emoji = emojis ? getConquistaEmoji(emojis, conquista.id) : conquista.emoji;
      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Conquista desbloqueada!`)
        .setDescription(
          `<@${userId}> desbloqueou a conquista **${conquista.nome}**!\n*${conquista.descricao}*`
        )
        .setColor(conquista.cor)
        .setTimestamp();

      await (channel as any).send({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err }, "Erro ao anunciar conquistas");
  }
}
