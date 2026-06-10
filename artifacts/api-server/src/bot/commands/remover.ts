import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { figurinhasTable, albumsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("remover-figurinha")
  .setDescription("Remove uma figurinha do seu álbum")
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha a remover")
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const numero = interaction.options.getInteger("numero", true);
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    const [figurinha] = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, userId),
          eq(figurinhasTable.numero, numero)
        )
      )
      .limit(1);

    if (!figurinha) {
      await interaction.editReply(`❌ Você não tem uma figurinha com o número **#${numero}**!`);
      return;
    }

    await db
      .delete(figurinhasTable)
      .where(eq(figurinhasTable.id, figurinha.id));

    // Atualizar total do álbum
    const album = await db
      .select()
      .from(albumsTable)
      .where(
        and(
          eq(albumsTable.guildId, guildId),
          eq(albumsTable.userId, userId)
        )
      )
      .limit(1);

    if (album[0]) {
      await db
        .update(albumsTable)
        .set({
          totalFigurinhas: Math.max(0, album[0].totalFigurinhas - 1),
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(albumsTable.guildId, guildId),
            eq(albumsTable.userId, userId)
          )
        );
    }

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Figurinha removida")
      .setDescription(`A figurinha **#${figurinha.numero} — ${figurinha.titulo}** foi removida do seu álbum.`)
      .setThumbnail(figurinha.imageUrl)
      .setColor(0xed4245)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao remover figurinha");
    await interaction.editReply("❌ Erro ao remover a figurinha. Tente novamente.");
  }
}
