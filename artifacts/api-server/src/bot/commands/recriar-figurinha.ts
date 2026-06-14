import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

export const data = new SlashCommandBuilder()
  .setName("recriar-figurinha")
  .setDescription("[ADMIN] Atualiza a imagem de uma figurinha existente no catálogo")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo")
      .setRequired(true)
      .setMinValue(1)
  )
  .addAttachmentOption((opt) =>
    opt
      .setName("foto")
      .setDescription("Nova imagem da figurinha")
      .setRequired(true)
  );

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const numero = interaction.options.getInteger("numero", true);
  const foto = interaction.options.getAttachment("foto", true);
  const guildId = interaction.guildId!;

  if (!foto.contentType?.startsWith("image/")) {
    await interaction.editReply("❌ O arquivo precisa ser uma imagem (PNG, JPG, GIF, etc.)!");
    return;
  }

  try {
    const [figurinha] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, numero)
        )
      )
      .limit(1);

    if (!figurinha) {
      await interaction.editReply(`❌ Figurinha **#${numero}** não encontrada no catálogo deste servidor.`);
      return;
    }

    const urlAntiga = figurinha.imageUrl;

    await db
      .update(catalogoFigurinhasTable)
      .set({ imageUrl: foto.url })
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, numero)
        )
      );

    const emojis = await getGuildEmojis(guildId);
    const raridadeEmoji = getRaridadeEmoji(emojis, figurinha.raridade);

    logger.info(
      { guildId, numero, titulo: figurinha.titulo, urlAntiga, urlNova: foto.url },
      "[recriar-figurinha] imagem atualizada"
    );

    const embed = new EmbedBuilder()
      .setTitle(`✅ Imagem atualizada — #${numero} ${figurinha.titulo}`)
      .setDescription(figurinha.descricao ? `*${figurinha.descricao}*` : "Sem descrição")
      .setImage(foto.url)
      .setColor(getRaridadeColor(figurinha.raridade))
      .addFields(
        { name: "Título", value: figurinha.titulo, inline: true },
        { name: "Raridade", value: `${raridadeEmoji} ${figurinha.raridade}`, inline: true },
        { name: "Número", value: `#${numero}`, inline: true },
      )
      .setFooter({
        text: `Atualizado por ${interaction.user.username} • URL anterior substituída`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao recriar figurinha");
    await interaction.editReply("❌ Erro ao atualizar a imagem. Tente novamente.");
  }
}
