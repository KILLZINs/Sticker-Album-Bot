import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable, moedasUsuarioTable } from "@workspace/db";
import { eq, desc, count, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Ranking do servidor — figurinhas únicas ou moedas")
  .addStringOption((opt) =>
    opt
      .setName("tipo")
      .setDescription("Tipo do ranking")
      .setRequired(false)
      .addChoices(
        { name: "🎴 Figurinhas únicas (padrão)", value: "figurinhas" },
        { name: "💰 Mais ricos (moedas)", value: "moedas" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const tipo = (interaction.options.getString("tipo") ?? "figurinhas") as "figurinhas" | "moedas";

  try {
    const [emojis, moedaCfg, totalCatResult] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
      db.select({ total: count() }).from(catalogoFigurinhasTable).where(eq(catalogoFigurinhasTable.guildId, guildId)),
    ]);

    const totalCatalogo = totalCatResult[0]?.total ?? 0;
    const nomeMoeda = moedaCfg.nomeMoeda;

    const medalhas = [emojis.ranking_primeiro, emojis.ranking_segundo, emojis.ranking_terceiro];

    if (tipo === "moedas") {
      const top = await db
        .select({
          userId: moedasUsuarioTable.userId,
          username: moedasUsuarioTable.username,
          saldo: moedasUsuarioTable.saldo,
        })
        .from(moedasUsuarioTable)
        .where(eq(moedasUsuarioTable.guildId, guildId))
        .orderBy(desc(moedasUsuarioTable.saldo))
        .limit(10);

      if (top.length === 0) {
        await interaction.editReply(`${emojis.moedas} Ninguém tem ${nomeMoeda} ainda!`);
        return;
      }

      const linhas = top.map((entry, i) => {
        const pos = medalhas[i] ?? `**${i + 1}.**`;
        const voce = entry.userId === interaction.user.id ? " 👈 **você**" : "";
        return `${pos} <@${entry.userId}> — **${entry.saldo.toLocaleString("pt-BR")}** ${nomeMoeda}${voce}`;
      });

      const meuEntry = top.find((e) => e.userId === interaction.user.id);
      let posicaoMinha = "";
      if (!meuEntry) {
        const todos = await db
          .select({ userId: moedasUsuarioTable.userId, saldo: moedasUsuarioTable.saldo })
          .from(moedasUsuarioTable)
          .where(eq(moedasUsuarioTable.guildId, guildId))
          .orderBy(desc(moedasUsuarioTable.saldo));
        const meuIdx = todos.findIndex((e) => e.userId === interaction.user.id);
        if (meuIdx >= 0) {
          posicaoMinha = `\n\n📍 Sua posição: **${meuIdx + 1}º** com **${todos[meuIdx]!.saldo.toLocaleString("pt-BR")}** ${nomeMoeda}`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${emojis.moedas} Ranking — Mais Ricos`)
        .setColor(0xf1c40f)
        .setDescription(linhas.join("\n") + posicaoMinha)
        .setFooter({ text: `Top ${top.length} jogadores por ${nomeMoeda} · Use /saldo para ver o seu` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Ranking de figurinhas únicas
    const top = await db
      .select({
        userId: colecaoUsuarioTable.userId,
        username: colecaoUsuarioTable.username,
        total: countDistinct(colecaoUsuarioTable.catalogoId),
      })
      .from(colecaoUsuarioTable)
      .where(eq(colecaoUsuarioTable.guildId, guildId))
      .groupBy(colecaoUsuarioTable.userId, colecaoUsuarioTable.username)
      .orderBy(desc(countDistinct(colecaoUsuarioTable.catalogoId)))
      .limit(10);

    if (top.length === 0) {
      await interaction.editReply(
        "📭 Ninguém desbloqueou figurinhas ainda!\n\nAbra um pacote com **/abrir-pacote** para começar."
      );
      return;
    }

    const linhas = top.map((entry, i) => {
      const pos = medalhas[i] ?? `**${i + 1}.**`;
      const voce = entry.userId === interaction.user.id ? " 👈 **você**" : "";
      const progresso = totalCatalogo > 0 ? Math.round((entry.total / totalCatalogo) * 100) : 0;
      const barraLen = 8;
      const preenchido = Math.round((progresso / 100) * barraLen);
      const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);
      return `${pos} <@${entry.userId}> — **${entry.total}**/${totalCatalogo} \`${barra}\` ${progresso}%${voce}`;
    });

    let posicaoMinha = "";
    const meuEntry = top.find((e) => e.userId === interaction.user.id);
    if (!meuEntry) {
      const todos = await db
        .select({ userId: colecaoUsuarioTable.userId, total: countDistinct(colecaoUsuarioTable.catalogoId) })
        .from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId))
        .groupBy(colecaoUsuarioTable.userId)
        .orderBy(desc(countDistinct(colecaoUsuarioTable.catalogoId)));
      const meuIdx = todos.findIndex((e) => e.userId === interaction.user.id);
      if (meuIdx >= 0) {
        posicaoMinha = `\n\n📍 Sua posição: **${meuIdx + 1}º** com **${todos[meuIdx]!.total}** figurinha${todos[meuIdx]!.total !== 1 ? "s" : ""} única${todos[meuIdx]!.total !== 1 ? "s" : ""}`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Ranking — Melhores Colecionadores`)
      .setColor(0xf1c40f)
      .setDescription(linhas.join("\n") + posicaoMinha)
      .setFooter({ text: `Top ${top.length} · Catálogo: ${totalCatalogo} figurinha${totalCatalogo !== 1 ? "s" : ""} · Use /ranking tipo:moedas para ver os mais ricos` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar ranking");
    await interaction.editReply("❌ Erro ao buscar o ranking. Tente novamente.");
  }
}
