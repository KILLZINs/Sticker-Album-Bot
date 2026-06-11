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
import { catalogoFigurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("apagar-figurinha")
  .setDescription("[ADMIN] Apaga permanentemente uma figurinha do catálogo do servidor")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo")
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const numero = interaction.options.getInteger("numero", true);
  const guildId = interaction.guildId!;

  try {
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
        `❌ Não existe figurinha com o número **#${numero}** no catálogo!`
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Confirmar exclusão do catálogo")
      .setDescription(
        `Tem certeza que deseja apagar a figurinha do catálogo?\n\n` +
          `**#${catalogo.numero} — ${catalogo.titulo}**\n` +
          `Raridade: ${catalogo.raridade}\n\n` +
          `> ⚠️ Esta ação removerá esta figurinha do catálogo **e do álbum de todos os usuários**!`
      )
      .setThumbnail(catalogo.imageUrl)
      .setColor(0xed4245);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("apagar_confirm")
        .setLabel("🗑️ Apagar permanentemente")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("apagar_cancel")
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

      if (btn.customId === "apagar_cancel") {
        await btn.update({ content: "❎ Exclusão cancelada.", embeds: [], components: [] });
        return;
      }

      await db
        .delete(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.id, catalogo.id));

      const embedSucesso = new EmbedBuilder()
        .setTitle("🗑️ Figurinha apagada do catálogo")
        .setDescription(
          `**#${catalogo.numero} — ${catalogo.titulo}** foi removida do catálogo e do álbum de todos os usuários.`
        )
        .setColor(0xed4245)
        .setTimestamp();

      await btn.update({ embeds: [embedSucesso], components: [] });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction
          .editReply({ content: "⏰ Tempo expirado — nenhuma ação tomada.", embeds: [], components: [] })
          .catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao apagar figurinha");
    await interaction.editReply("❌ Erro ao apagar a figurinha. Tente novamente.");
  }
}
