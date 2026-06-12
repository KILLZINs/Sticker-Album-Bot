import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";
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
  .setDescription("Mostra suas figurinhas repetidas (cópias extras)")
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
      .select({
        catalogoId: colecaoUsuarioTable.catalogoId,
        copias: count(),
        titulo: catalogoFigurinhasTable.titulo,
        raridade: catalogoFigurinhasTable.raridade,
        numero: catalogoFigurinhasTable.numero,
      })
      .from(colecaoUsuarioTable)
      .innerJoin(
        catalogoFigurinhasTable,
        eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id)
      )
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId)
        )
      )
      .groupBy(
        colecaoUsuarioTable.catalogoId,
        catalogoFigurinhasTable.titulo,
        catalogoFigurinhasTable.raridade,
        catalogoFigurinhasTable.numero
      )
      .having(gt(count(), 1))
      .orderBy(catalogoFigurinhasTable.numero);

    if (repetidas.length === 0) {
      await interaction.editReply(
        `✅ ${alvoUser.id === interaction.user.id ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha repetida!`
      );
      return;
    }

    const linhas = repetidas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      const extras = fig.copias - 1;
      return `${emoji} **#${fig.numero}** ${fig.titulo} *(+${extras} extra${extras > 1 ? "s" : ""})*`;
    });

    const totalExtras = repetidas.reduce((acc, f) => acc + (f.copias - 1), 0);

    const embed = new EmbedBuilder()
      .setTitle(`♻️ Figurinhas repetidas de ${alvoUser.username}`)
      .setColor(0x7B2FBE)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**${repetidas.length} figurinha${repetidas.length > 1 ? "s" : ""} com cópias extras** ` +
        `(${totalExtras} extra${totalExtras > 1 ? "s" : ""} no total)\n\n` +
        `Use **/dar-figurinha** para passar cópias extras a outros!\n\n` +
        linhas.slice(0, 40).join("\n") +
        (linhas.length > 40 ? `\n...e mais ${linhas.length - 40}` : "")
      )
      .setFooter({ text: "Troque suas repetidas com /propor-troca ou doe com /dar-figurinha!" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar repetidas");
    await interaction.editReply("❌ Erro ao listar as repetidas. Tente novamente.");
  }
}
