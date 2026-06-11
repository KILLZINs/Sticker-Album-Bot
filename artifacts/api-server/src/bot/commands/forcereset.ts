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
  .setDescription("[ADMIN] Reseta todos os dados de um usuário (figurinhas, moedas, conquistas e pacotes diários)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

  try {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Confirmar reset de usuário")
      .setDescription(
        `Tem certeza que deseja resetar **todos os dados** de <@${alvo.id}>?\n\n` +
          `Os seguintes dados serão **permanentemente apagados**:\n` +
          `• 🃏 Figurinhas da coleção\n` +
          `• 💰 Moedas e nível de rebirth\n` +
          `• 🏆 Conquistas desbloqueadas\n` +
          `• 📦 Histórico de pacotes diários\n\n` +
          `> ⚠️ O catálogo global do servidor **não será afetado**.`
      )
      .setThumbnail(alvo.displayAvatarURL())
      .setColor(0xed4245);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("forcereset_confirm")
        .setLabel("🗑️ Confirmar Reset")
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

      // Apagar apenas dados do usuário — o catálogo global não é tocado
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
        .setTitle("🗑️ Dados do usuário resetados")
        .setDescription(
          `Todos os dados de <@${alvo.id}> foram apagados com sucesso.\n\n` +
            `✅ Figurinhas da coleção removidas\n` +
            `✅ Moedas e nível de rebirth removidos\n` +
            `✅ Conquistas removidas\n` +
            `✅ Histórico de pacotes diários removido\n\n` +
            `O catálogo global do servidor permanece intacto.`
        )
        .setColor(0x57f287)
        .setTimestamp();

      await btn.update({ embeds: [embedSucesso], components: [] });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction
          .editReply({
            content: "⏰ Tempo expirado — nenhuma ação tomada.",
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao executar forcereset");
    await interaction.editReply("❌ Erro ao resetar os dados. Tente novamente.");
  }
}
