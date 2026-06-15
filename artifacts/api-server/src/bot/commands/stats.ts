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
      db.select({ total: count() }).from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId)),

      db.select({ raridade: catalogoFigurinhasTable.raridade, total: count() })
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId))
        .groupBy(catalogoFigurinhasTable.raridade),

      db.select({ total: count() }).from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId)),

      db.select({ total: countDistinct(colecaoUsuarioTable.userId) })
        .from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId)),

      db.select({ total: count() }).from(conquistasUsuarioTable)
        .where(
          and(
            eq(conquistasUsuarioTable.guildId, guildId),
            sql`${conquistasUsuarioTable.conquistaId} NOT LIKE 'troca_realizada_%'`
          )
        ),

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

      db.select({ userId: moedasUsuarioTable.userId, username: moedasUsuarioTable.username, saldo: moedasUsuarioTable.saldo })
        .from(moedasUsuarioTable)
        .where(eq(moedasUsuarioTable.guildId, guildId))
        .orderBy(desc(moedasUsuarioTable.saldo))
        .limit(1),

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
      .setTitle(`📊 Estatísticas — ${interaction.guild?.name ?? "Servidor"}`)
      .setColor(0x470f78)
      .setThumbnail(interaction.guild?.iconURL() ?? null)
      .addFields(
        {
          name: "📖 Catálogo",
          value: totalCat === 0
            ? "*Nenhuma figurinha criada ainda.*"
            : `**${totalCat}** figurinha${totalCat !== 1 ? "s" : ""} · ${rarLinhas}`,
          inline: false,
        },
        {
          name: "🎴 Cópias coletadas",
          value: `**${totalColetadas.toLocaleString("pt-BR")}** no total`,
          inline: true,
        },
        {
          name: "👥 Jogadores ativos",
          value: `**${totalJogadores.toLocaleString("pt-BR")}** com álbum`,
          inline: true,
        },
        {
          name: "🏅 Conquistas",
          value: `**${totalConquistas.toLocaleString("pt-BR")}** desbloqueadas`,
          inline: true,
        },
        ...(topFig ? [{
          name: `${emojis.ranking_primeiro} Top colecionador`,
          value: `<@${topFig.userId}>\n**${topFig.total}** figurinha${topFig.total !== 1 ? "s" : ""} únicas`,
          inline: true,
        }] : []),
        ...(topMoedas ? [{
          name: `${emojis.moedas} Mais rico`,
          value: `<@${topMoedas.userId}>\n**${topMoedas.saldo.toLocaleString("pt-BR")}** ${nomeMoeda}`,
          inline: true,
        }] : []),
        ...((maisRara && totalCat > 0) ? [{
          name: `💀 Mais rara (menos donos)`,
          value: `${getRaridadeEmoji(emojis, maisRara.raridade)} **#${maisRara.numero} ${maisRara.titulo}**\n${maisRara.donos} dono${maisRara.donos !== 1 ? "s" : ""}`,
          inline: true,
        }] : []),
        ...(maisPopular ? [{
          name: `🔥 Mais popular`,
          value: `${getRaridadeEmoji(emojis, maisPopular.raridade)} **#${maisPopular.numero} ${maisPopular.titulo}**\n${maisPopular.donos} dono${maisPopular.donos !== 1 ? "s" : ""}`,
          inline: true,
        }] : []),
      )
      .setFooter({ text: "Atualizado em tempo real · Use /ranking para ver a classificação completa" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar stats");
    await interaction.editReply("❌ Erro ao carregar as estatísticas. Tente novamente.");
  }
}
