import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import {
  catalogoFigurinhasTable,
  colecaoUsuarioTable,
  moedasUsuarioTable,
  conquistasUsuarioTable,
} from "@workspace/db";
import { eq, count, countDistinct, desc, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Estatísticas gerais do servidor — catálogo, jogadores e recordes");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId!;

  try {
    const [emojis, moedaCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);
    const nomeMoeda = moedaCfg.nomeMoeda;

    // ── Queries em paralelo ──
    const [
      totalCatResult,
      rarDistResult,
      totalColetadasResult,
      jogadoresResult,
      conquistasResult,
      topFigResult,
      topMoedasResult,
      figMaisRaraResult,
      figMaisPopularResult,
    ] = await Promise.all([
      // Total de figurinhas no catálogo
      db.select({ total: count() }).from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId)),

      // Distribuição por raridade no catálogo
      db.select({ raridade: catalogoFigurinhasTable.raridade, total: count() })
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId))
        .groupBy(catalogoFigurinhasTable.raridade),

      // Total de figurinhas coletadas (todas as cópias)
      db.select({ total: count() }).from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId)),

      // Total de jogadores com pelo menos 1 figurinha
      db.select({ total: countDistinct(colecaoUsuarioTable.userId) })
        .from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId)),

      // Total de conquistas desbloqueadas (apenas as reais)
      db.select({ total: count() }).from(conquistasUsuarioTable)
        .where(
          and(
            eq(conquistasUsuarioTable.guildId, guildId),
            sql`${conquistasUsuarioTable.conquistaId} NOT LIKE 'troca_realizada_%'`
          )
        ),

      // Top colecionador (mais figurinhas únicas)
      db.select({
        userId: colecaoUsuarioTable.userId,
        username: colecaoUsuarioTable.username,
        total: countDistinct(colecaoUsuarioTable.catalogoId),
      })
        .from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId))
        .groupBy(colecaoUsuarioTable.userId, colecaoUsuarioTable.username)
        .orderBy(desc(countDistinct(colecaoUsuarioTable.catalogoId)))
        .limit(1),

      // Mais rico
      db.select({ userId: moedasUsuarioTable.userId, username: moedasUsuarioTable.username, saldo: moedasUsuarioTable.saldo })
        .from(moedasUsuarioTable)
        .where(eq(moedasUsuarioTable.guildId, guildId))
        .orderBy(desc(moedasUsuarioTable.saldo))
        .limit(1),

      // Figurinha mais rara (lendária com menos donos únicos)
      db.select({
        titulo: catalogoFigurinhasTable.titulo,
        numero: catalogoFigurinhasTable.numero,
        raridade: catalogoFigurinhasTable.raridade,
        donos: countDistinct(colecaoUsuarioTable.userId),
      })
        .from(catalogoFigurinhasTable)
        .leftJoin(colecaoUsuarioTable, eq(catalogoFigurinhasTable.id, colecaoUsuarioTable.catalogoId))
        .where(eq(catalogoFigurinhasTable.guildId, guildId))
        .groupBy(catalogoFigurinhasTable.id, catalogoFigurinhasTable.titulo, catalogoFigurinhasTable.numero, catalogoFigurinhasTable.raridade)
        .orderBy(countDistinct(colecaoUsuarioTable.userId))
        .limit(1),

      // Figurinha mais popular (maior número de donos)
      db.select({
        titulo: catalogoFigurinhasTable.titulo,
        numero: catalogoFigurinhasTable.numero,
        raridade: catalogoFigurinhasTable.raridade,
        donos: countDistinct(colecaoUsuarioTable.userId),
      })
        .from(catalogoFigurinhasTable)
        .innerJoin(colecaoUsuarioTable, eq(catalogoFigurinhasTable.id, colecaoUsuarioTable.catalogoId))
        .where(eq(catalogoFigurinhasTable.guildId, guildId))
        .groupBy(catalogoFigurinhasTable.id, catalogoFigurinhasTable.titulo, catalogoFigurinhasTable.numero, catalogoFigurinhasTable.raridade)
        .orderBy(desc(countDistinct(colecaoUsuarioTable.userId)))
        .limit(1),
    ]);

    const totalCat = totalCatResult[0]?.total ?? 0;
    const totalColetadas = totalColetadasResult[0]?.total ?? 0;
    const totalJogadores = jogadoresResult[0]?.total ?? 0;
    const totalConquistas = conquistasResult[0]?.total ?? 0;

    // Monta linha de raridades
    const RARIDADE_ORDEM = ["lendária", "épica", "rara", "incomum", "comum"];
    const rarMap = new Map(rarDistResult.map((r) => [r.raridade, r.total]));
    const rarLinhas = RARIDADE_ORDEM
      .filter((r) => rarMap.has(r))
      .map((r) => `${getRaridadeEmoji(emojis, r)} ${r.charAt(0).toUpperCase() + r.slice(1)}: **${rarMap.get(r)}**`)
      .join(" · ");

    const topFig = topFigResult[0];
    const topMoedas = topMoedasResult[0];
    const maisRara = figMaisRaraResult[0];
    const maisPopular = figMaisPopularResult[0];

    const embed = new EmbedBuilder()
      .setTitle("📊 Estatísticas do Servidor")
      .setColor(0x470f78)
      .addFields(
        {
          name: "📖 Catálogo",
          value: totalCat === 0
            ? "_Nenhuma figurinha criada ainda._"
            : `**${totalCat}** figurinha${totalCat !== 1 ? "s" : ""} no total\n${rarLinhas}`,
          inline: false,
        },
        {
          name: "🎴 Figurinhas coletadas",
          value: `**${totalColetadas}** cópias coletadas no total`,
          inline: true,
        },
        {
          name: "👥 Jogadores",
          value: `**${totalJogadores}** com álbum ativo`,
          inline: true,
        },
        {
          name: "🏅 Conquistas",
          value: `**${totalConquistas}** desbloqueadas no total`,
          inline: true,
        },
        ...(topFig ? [{
          name: `${emojis.ranking_primeiro} Top colecionador`,
          value: `<@${topFig.userId}> — **${topFig.total}** figurinha${topFig.total !== 1 ? "s" : ""} únicas`,
          inline: true,
        }] : []),
        ...(topMoedas ? [{
          name: `${emojis.moedas} Mais rico`,
          value: `<@${topMoedas.userId}> — **${topMoedas.saldo}** ${nomeMoeda}`,
          inline: true,
        }] : []),
        ...((maisRara && totalCat > 0) ? [{
          name: `💀 Mais rara`,
          value: `${getRaridadeEmoji(emojis, maisRara.raridade)} **#${maisRara.numero} ${maisRara.titulo}** — ${maisRara.donos} dono${maisRara.donos !== 1 ? "s" : ""}`,
          inline: true,
        }] : []),
        ...(maisPopular ? [{
          name: `🔥 Mais popular`,
          value: `${getRaridadeEmoji(emojis, maisPopular.raridade)} **#${maisPopular.numero} ${maisPopular.titulo}** — ${maisPopular.donos} dono${maisPopular.donos !== 1 ? "s" : ""}`,
          inline: true,
        }] : []),
      )
      .setFooter({ text: `Estatísticas do servidor • Atualizado em tempo real` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar stats");
    await interaction.editReply("❌ Erro ao carregar as estatísticas. Tente novamente.");
  }
}
