import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { albumsTable, figurinhasTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Mostra o ranking de quem tem mais figurinhas no servidor");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;

  try {
    const top = await db
      .select()
      .from(albumsTable)
      .where(eq(albumsTable.guildId, guildId))
      .orderBy(desc(albumsTable.totalFigurinhas))
      .limit(10);

    if (top.length === 0) {
      await interaction.editReply(
        "📭 Nenhum álbum encontrado neste servidor ainda!\n\nUse **/adicionar-figurinha** para começar."
      );
      return;
    }

    const medalhas = ["🥇", "🥈", "🥉"];

    const linhas = top.map((album, i) => {
      const pos = medalhas[i] ?? `**${i + 1}.**`;
      const voce = album.userId === interaction.user.id ? " 👈" : "";
      return `${pos} <@${album.userId}> — **${album.totalFigurinhas}** figurinha${album.totalFigurinhas !== 1 ? "s" : ""}${voce}`;
    });

    // Posição do usuário atual se não estiver no top 10
    let posicaoMinha = "";
    const meuAlbum = top.find((a) => a.userId === interaction.user.id);
    if (!meuAlbum) {
      const todos = await db
        .select()
        .from(albumsTable)
        .where(eq(albumsTable.guildId, guildId))
        .orderBy(desc(albumsTable.totalFigurinhas));

      const meuIdx = todos.findIndex((a) => a.userId === interaction.user.id);
      if (meuIdx >= 0) {
        posicaoMinha = `\n\n📍 Sua posição: **${meuIdx + 1}º** com **${todos[meuIdx]!.totalFigurinhas}** figurinha${todos[meuIdx]!.totalFigurinhas !== 1 ? "s" : ""}`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 Ranking do Álbum de Figurinhas")
      .setColor(0xf1c40f)
      .setDescription(linhas.join("\n") + posicaoMinha)
      .setFooter({ text: `Top ${top.length} colecionadores do servidor` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar ranking");
    await interaction.editReply("❌ Erro ao buscar o ranking. Tente novamente.");
  }
}
