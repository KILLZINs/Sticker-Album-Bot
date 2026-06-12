import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, desc, count, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Mostra o ranking de quem tem mais figurinhas únicas desbloqueadas");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;

  try {
    // Total de figurinhas no catálogo
    const [{ totalCatalogo }] = await db
      .select({ totalCatalogo: count() })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    // Top 10 por figurinhas ÚNICAS desbloqueadas (sem contar duplicatas)
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

    const medalhas = ["🥇", "🥈", "🥉"];

    const linhas = top.map((entry, i) => {
      const pos = medalhas[i] ?? `**${i + 1}.**`;
      const voce = entry.userId === interaction.user.id ? " 👈" : "";
      const progresso = totalCatalogo > 0 ? Math.round((entry.total / totalCatalogo) * 100) : 0;
      return `${pos} <@${entry.userId}> — **${entry.total}**/${totalCatalogo} únicas (${progresso}%)${voce}`;
    });

    // Posição do usuário atual se fora do top 10
    let posicaoMinha = "";
    const meuEntry = top.find((e) => e.userId === interaction.user.id);
    if (!meuEntry) {
      const todos = await db
        .select({
          userId: colecaoUsuarioTable.userId,
          total: countDistinct(colecaoUsuarioTable.catalogoId),
        })
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
      .setTitle("🏆 Ranking do Álbum de Figurinhas")
      .setColor(0xf1c40f)
      .setDescription(linhas.join("\n") + posicaoMinha)
      .setFooter({ text: `Top ${top.length} colecionadores • Catálogo: ${totalCatalogo} figurinha${totalCatalogo !== 1 ? "s" : ""}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar ranking");
    await interaction.editReply("❌ Erro ao buscar o ranking. Tente novamente.");
  }
}
