import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { figurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

export const data = new SlashCommandBuilder()
  .setName("repetidas")
  .setDescription("Mostra suas figurinhas repetidas")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Ver as repetidas de outro usuário")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;

  try {
    const repetidas = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, userId),
          eq(figurinhasTable.repetida, true)
        )
      )
      .orderBy(figurinhasTable.numero);

    if (repetidas.length === 0) {
      await interaction.editReply(
        `✅ ${alvoUser.id === interaction.user.id ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha repetida! Que inveja 😄`
      );
      return;
    }

    const linhas = repetidas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      return `${emoji} **#${fig.numero}** ${fig.titulo}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`♻️ Figurinhas repetidas de ${alvoUser.username}`)
      .setColor(0xfee75c)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**${repetidas.length} figurinha${repetidas.length > 1 ? "s" : ""} repetida${repetidas.length > 1 ? "s" : ""}**\n\nUse **/dar-figurinha** para trocar com seus amigos!\n\n` +
        linhas.slice(0, 40).join("\n") +
        (linhas.length > 40 ? `\n...e mais ${linhas.length - 40}` : "")
      )
      .setFooter({ text: "Dica: troque suas repetidas com /dar-figurinha!" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar repetidas");
    await interaction.editReply("❌ Erro ao listar as repetidas. Tente novamente.");
  }
}
