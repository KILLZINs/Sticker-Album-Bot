import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { db } from "@workspace/db";
import {
  colecaoUsuarioTable,
  moedasUsuarioTable,
  conquistasUsuarioTable,
  pacotesDiariosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { isAdmin, ADMIN_DENY_MSG } from "../lib/admin-check.js";

export const data = new SlashCommandBuilder()
  .setName("forceresetall")
  .setDescription("[ADMIN] ⚠️ Reseta TODOS os dados de TODOS os usuários do servidor");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;

  const embedAviso = new EmbedBuilder()
    .setTitle("☢️ ATENÇÃO — Ação Irreversível")
    .setDescription(
      `Você está prestes a **apagar TODOS os dados de TODOS os usuários** deste servidor.\n\n` +
      `Os seguintes dados serão **permanentemente deletados**:\n` +
      `> 🃏 Todas as coleções de figurinhas\n` +
      `> 💰 Todas as carteiras de moedas e níveis de rebirth\n` +
      `> 🏆 Todas as conquistas desbloqueadas\n` +
      `> 📦 Todo o histórico de pacotes diários\n\n` +
      `⚠️ **O catálogo global do servidor NÃO será afetado.**\n\n` +
      `Clique em **Prosseguir** e confirme digitando \`CONFIRMAR\` para executar.`
    )
    .setColor(0xed4245);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("forceresetall_proceed")
      .setLabel("☢️ Prosseguir")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("forceresetall_cancel")
      .setLabel("❌ Cancelar")
      .setStyle(ButtonStyle.Secondary)
  );

  const reply = await interaction.editReply({ embeds: [embedAviso], components: [row] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (btn) => {
    collector.stop();

    if (btn.customId === "forceresetall_cancel") {
      await btn.update({ content: "❎ Reset cancelado.", embeds: [], components: [] });
      return;
    }

    // Abrir modal de confirmação final
    const modal = new ModalBuilder()
      .setCustomId("forceresetall_modal")
      .setTitle("⚠️ Confirmação final");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("confirmacao")
          .setLabel('Digite exatamente "CONFIRMAR" para prosseguir')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("CONFIRMAR")
          .setRequired(true)
          .setMinLength(9).setMaxLength(9)
      )
    );

    await btn.showModal(modal);

    // Aguardar o modal
    let modalInteraction;
    try {
      modalInteraction = await btn.awaitModalSubmit({
        time: 60_000,
        filter: (m) => m.customId === "forceresetall_modal" && m.user.id === interaction.user.id,
      });
    } catch {
      await interaction.editReply({ content: "⏰ Tempo expirado — nenhuma ação tomada.", embeds: [], components: [] });
      return;
    }

    const texto = modalInteraction.fields.getTextInputValue("confirmacao").trim();

    if (texto !== "CONFIRMAR") {
      await modalInteraction.reply({
        content: `❌ Texto incorreto (\`${texto}\`). Reset cancelado.`,
        ephemeral: true,
      });
      await interaction.editReply({ content: "❌ Confirmação incorreta — reset cancelado.", embeds: [], components: [] });
      return;
    }

    await modalInteraction.deferUpdate();

    try {
      // Deletar todos os dados do servidor (sem filtro de userId)
      const [r1, r2, r3, r4] = await Promise.all([
        db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.guildId, guildId)).returning(),
        db.delete(moedasUsuarioTable).where(eq(moedasUsuarioTable.guildId, guildId)).returning(),
        db.delete(conquistasUsuarioTable).where(eq(conquistasUsuarioTable.guildId, guildId)).returning(),
        db.delete(pacotesDiariosTable).where(eq(pacotesDiariosTable.guildId, guildId)).returning(),
      ]);

      logger.warn(
        { guildId, adminId: interaction.user.id, figurinhas: r1.length, moedas: r2.length, conquistas: r3.length, pacotes: r4.length },
        "forceresetall executado"
      );

      const embedSucesso = new EmbedBuilder()
        .setTitle("🗑️ Reset global concluído")
        .setDescription(
          `Todos os dados de todos os usuários foram apagados com sucesso.\n\n` +
          `✅ **${r1.length}** entradas de coleção removidas\n` +
          `✅ **${r2.length}** carteiras de moedas removidas\n` +
          `✅ **${r3.length}** conquistas removidas\n` +
          `✅ **${r4.length}** registros de pacotes removidos\n\n` +
          `O catálogo global do servidor permanece intacto.`
        )
        .setColor(0x9B59B6)
        .setTimestamp()
        .setFooter({ text: `Executado por ${interaction.user.username}` });

      await interaction.editReply({ embeds: [embedSucesso], components: [] });
    } catch (err) {
      logger.error({ err, guildId }, "Erro ao executar forceresetall");
      await interaction.editReply({ content: "❌ Erro ao resetar os dados. Tente novamente.", embeds: [], components: [] });
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: "⏰ Tempo expirado — nenhuma ação tomada.", embeds: [], components: [] }).catch(() => {});
    }
  });
}
