import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import {
  colecaoUsuarioTable,
  moedasUsuarioTable,
  conquistasUsuarioTable,
  pacotesDiariosTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("forcereset")
  .setDescription("[ADMIN] Reseta completamente os dados de um usuário")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Usuário que terá os dados resetados")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const alvo = interaction.options.getUser("usuario", true);
  const guildId = interaction.guildId!;

  if (alvo.bot) {
    await interaction.editReply("❌ Não é possível resetar dados de um bot!");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Confirmar Reset Completo")
    .setDescription(
      `Você está prestes a **resetar completamente** os dados de <@${alvo.id}>.\n\n` +
        `Isso irá apagar permanentemente:\n` +
        `• 🃏 Todas as figurinhas da coleção\n` +
        `• 💰 Moedas e nível de rebirth\n` +
        `• 🏆 Todas as conquistas\n` +
        `• 📦 Histórico de pacotinhos diários\n\n` +
        `**Esta ação é irreversível!** Tem certeza?`
    )
    .setColor(0xe74c3c)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("forcereset_confirm")
      .setLabel("✅ Confirmar Reset")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("forcereset_cancel")
      .setLabel("❌ Cancelar")
      .setStyle(ButtonStyle.Secondary)
  );

  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (btn) => {
    collector.stop();

    if (btn.customId === "forcereset_cancel") {
      await btn.update({ content: "❎ Reset cancelado.", embeds: [], components: [] });
      return;
    }

    try {
      await db
        .delete(colecaoUsuarioTable)
        .where(
          and(
            eq(colecaoUsuarioTable.guildId, guildId),
            eq(colecaoUsuarioTable.userId, alvo.id)
          )
        );

      await db
        .delete(moedasUsuarioTable)
        .where(
          and(
            eq(moedasUsuarioTable.guildId, guildId),
            eq(moedasUsuarioTable.userId, alvo.id)
          )
        );

      await db
        .delete(conquistasUsuarioTable)
        .where(
          and(
            eq(conquistasUsuarioTable.guildId, guildId),
            eq(conquistasUsuarioTable.userId, alvo.id)
          )
        );

      await db
        .delete(pacotesDiariosTable)
        .where(
          and(
            eq(pacotesDiariosTable.guildId, guildId),
            eq(pacotesDiariosTable.userId, alvo.id)
          )
        );

      const embedSucesso = new EmbedBuilder()
        .setTitle("🗑️ Reset concluído!")
        .setDescription(
          `Todos os dados de **${alvo.username}** foram apagados com sucesso.\n\n` +
            `• 🃏 Figurinhas removidas\n` +
            `• 💰 Moedas e rebirth zerados\n` +
            `• 🏆 Conquistas removidas\n` +
            `• 📦 Pacotinhos diários resetados`
        )
        .setColor(0x57f287)
        .setThumbnail(alvo.displayAvatarURL())
        .setTimestamp();

      await btn.update({ embeds: [embedSucesso], components: [] });
    } catch (err) {
      logger.error({ err }, "Erro ao executar forcereset");
      await btn.update({
        content: "❌ Erro ao resetar os dados. Tente novamente.",
        embeds: [],
        components: [],
      });
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction
        .editReply({
          content: "⏰ Reset expirou — nenhuma ação tomada.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  });
}
