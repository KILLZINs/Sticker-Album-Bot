import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import {
  catalogoFigurinhasTable,
  colecaoUsuarioTable,
  pacotesDiariosTable,
} from "@workspace/db";
import { eq, and, notInArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// Quantas figurinhas por pacote
const FIGURINHAS_POR_PACOTE = 3;

// Cooldown de 24 horas em ms
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

// Pesos de raridade — quanto maior o peso, mais chance de sair
const RARIDADE_PESO: Record<string, number> = {
  comum: 55,
  incomum: 25,
  rara: 12,
  épica: 6,
  lendária: 2,
};

export const data = new SlashCommandBuilder()
  .setName("abrir-pacote")
  .setDescription("Abre seu pacotinho diário e ganha figurinhas aleatórias do catálogo!");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    // Verificar cooldown
    const [registro] = await db
      .select()
      .from(pacotesDiariosTable)
      .where(
        and(
          eq(pacotesDiariosTable.guildId, guildId),
          eq(pacotesDiariosTable.userId, userId)
        )
      )
      .limit(1);

    const agora = Date.now();

    if (registro) {
      const passouMs = agora - registro.ultimaAbertura.getTime();
      if (passouMs < COOLDOWN_MS) {
        const restanteMs = COOLDOWN_MS - passouMs;
        const horas = Math.floor(restanteMs / (1000 * 60 * 60));
        const minutos = Math.floor((restanteMs % (1000 * 60 * 60)) / (1000 * 60));
        await interaction.editReply(
          `⏳ Você já abriu seu pacotinho hoje!\n\nVolta em **${horas}h ${minutos}min** para o próximo.`
        );
        return;
      }
    }

    // Buscar todas as figurinhas do catálogo que o usuário NÃO tem
    const colecaoAtual = await db
      .select({ catalogoId: colecaoUsuarioTable.catalogoId })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId)
        )
      );

    const idsJaTem = colecaoAtual.map((c) => c.catalogoId);

    let disponiveis;
    if (idsJaTem.length > 0) {
      disponiveis = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(
          and(
            eq(catalogoFigurinhasTable.guildId, guildId),
            notInArray(catalogoFigurinhasTable.id, idsJaTem)
          )
        );
    } else {
      disponiveis = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId));
    }

    if (disponiveis.length === 0) {
      await interaction.editReply(
        "🏆 **Parabéns! Você completou o álbum!** Não há mais figurinhas novas para ganhar.\n\nPeça para um admin adicionar mais com **/criar-figurinha**!"
      );
      return;
    }

    // Sortear figurinhas com peso por raridade
    const quantidade = Math.min(FIGURINHAS_POR_PACOTE, disponiveis.length);
    const sorteadas = sortearComPeso(disponiveis, quantidade);

    // Inserir na coleção do usuário
    await db.insert(colecaoUsuarioTable).values(
      sorteadas.map((fig) => ({
        guildId,
        userId,
        username,
        catalogoId: fig.id,
      }))
    );

    // Atualizar/criar registro de pacote diário
    if (registro) {
      await db
        .update(pacotesDiariosTable)
        .set({ ultimaAbertura: new Date() })
        .where(eq(pacotesDiariosTable.id, registro.id));
    } else {
      await db.insert(pacotesDiariosTable).values({ guildId, userId, ultimaAbertura: new Date() });
    }

    // Montar embed de resultado
    const linhas = sorteadas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      return `${emoji} **${fig.titulo}** — ${fig.raridade}`;
    });

    // Pegar a mais rara para usar como imagem destaque
    const maisRara = sorteadas.reduce((melhor, atual) => {
      const pesoAtual = RARIDADE_PESO[atual.raridade] ?? 55;
      const pesoMelhor = RARIDADE_PESO[melhor.raridade] ?? 55;
      return pesoAtual < pesoMelhor ? atual : melhor;
    }, sorteadas[0]!);

    const totalAlbum = idsJaTem.length + sorteadas.length;
    const totalCatalogo = idsJaTem.length + disponiveis.length;

    const embed = new EmbedBuilder()
      .setTitle(`🎁 Pacotinho de ${username} aberto!`)
      .setDescription(
        `Você ganhou **${sorteadas.length} figurinha${sorteadas.length > 1 ? "s" : ""}**!\n\n` +
          linhas.join("\n")
      )
      .setImage(maisRara.imageUrl)
      .setColor(getRaridadeColor(maisRara.raridade))
      .addFields({
        name: "📊 Progresso do álbum",
        value: `${totalAlbum}/${totalCatalogo} figurinhas (${Math.round((totalAlbum / totalCatalogo) * 100)}%)`,
        inline: false,
      })
      .setFooter({ text: "Próximo pacotinho disponível em 24 horas!" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao abrir pacote");
    await interaction.editReply("❌ Erro ao abrir o pacotinho. Tente novamente.");
  }
}

function sortearComPeso(
  figurinhas: typeof catalogoFigurinhasTable.$inferSelect[],
  quantidade: number
): typeof catalogoFigurinhasTable.$inferSelect[] {
  const resultado: typeof catalogoFigurinhasTable.$inferSelect[] = [];
  const pool = [...figurinhas];

  for (let i = 0; i < quantidade && pool.length > 0; i++) {
    // Calcular peso total
    const pesoTotal = pool.reduce((sum, fig) => sum + (RARIDADE_PESO[fig.raridade] ?? 55), 0);
    let rand = Math.random() * pesoTotal;

    let escolhida = pool[0]!;
    for (const fig of pool) {
      rand -= RARIDADE_PESO[fig.raridade] ?? 55;
      if (rand <= 0) {
        escolhida = fig;
        break;
      }
    }

    resultado.push(escolhida);
    pool.splice(pool.indexOf(escolhida), 1);
  }

  return resultado;
}

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}
