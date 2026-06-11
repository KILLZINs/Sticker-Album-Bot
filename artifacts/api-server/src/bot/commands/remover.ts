import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("remover-figurinha")
  .setDescription("Remove uma cópia de uma figurinha do seu álbum pelo número do catálogo")
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo (use /catalogo para ver)")
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const numero = interaction.options.getInteger("numero", true);
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  try {
    // Buscar a figurinha no catálogo pelo número
    const [catalogo] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, numero)
        )
      )
      .limit(1);

    if (!catalogo) {
      await interaction.editReply(
        `❌ Não existe figurinha com o número **#${numero}** no catálogo deste servidor!`
      );
      return;
    }

    // Buscar uma cópia no álbum do usuário
    const [entrada] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId),
          eq(colecaoUsuarioTable.catalogoId, catalogo.id)
        )
      )
      .limit(1);

    if (!entrada) {
      await interaction.editReply(
        `❌ Você não tem a figurinha **#${numero} — ${catalogo.titulo}** no seu álbum!`
      );
      return;
    }

    // Remover apenas esta cópia (pelo id da linha)
    await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, entrada.id));

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Figurinha removida")
      .setDescription(
        `A figurinha **#${catalogo.numero} — ${catalogo.titulo}** foi removida do seu álbum.\n\n` +
          `*Se você tiver outras cópias, elas permanecem.*`
      )
      .setThumbnail(catalogo.imageUrl)
      .setColor(0xed4245)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao remover figurinha");
    await interaction.editReply("❌ Erro ao remover a figurinha. Tente novamente.");
  }
}
