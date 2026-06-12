import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  APIMessageComponentEmoji,
} from "discord.js";
import { db } from "@workspace/db";
import { emojiConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getGuildEmojis,
  invalidateGuildCache,
  EMOJI_DEFAULTS,
  type GuildEmojis,
  type EmojiChave,
} from "../lib/emoji-config.js";

const NOMES_CHAVES: Record<EmojiChave, string> = {
  moedas: "Moedas",
  pacote_standard: "Pacote Standard",
  pacote_deluxe: "Pacote Deluxe",
  pacote_ultimate: "Pacote Ultimate",
  raridade_comum: "Raridade Comum",
  raridade_incomum: "Raridade Incomum",
  raridade_rara: "Raridade Rara",
  raridade_epica: "Raridade Épica",
  raridade_lendaria: "Raridade Lendária",
};

export const data = new SlashCommandBuilder()
  .setName("configurar-emojis")
  .setDescription("[ADMIN] Configura os emojis personalizados usados nos embeds do servidor")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// Parse emoji string into a Discord emoji resolvable (handles custom emojis)
function resolveEmoji(emojiStr: string): APIMessageComponentEmoji | string {
  const match = emojiStr.match(/^<(a?):(\w+):(\d+)>$/);
  if (match) {
    return { animated: match[1] === "a", name: match[2]!, id: match[3]! };
  }
  return emojiStr;
}

function makeButton(customId: string, label: string, emojiStr: string): ButtonBuilder {
  const btn = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
  try {
    btn.setEmoji(resolveEmoji(emojiStr));
  } catch {
    // fallback: ignore emoji if invalid
  }
  return btn;
}

function buildPanelEmbed(emojis: GuildEmojis): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("⚙️ Configuração de Emojis")
    .setDescription(
      "Clique em um botão abaixo para alterar o emoji correspondente.\n" +
      "Aceita emojis padrão `💎` ou emojis customizados do servidor `<:nome:ID>`."
    )
    .addFields(
      {
        name: "Economia",
        value: `${emojis.moedas} Moedas`,
        inline: true,
      },
      {
        name: "Pacotes",
        value:
          `${emojis.pacote_standard} Standard\n` +
          `${emojis.pacote_deluxe} Deluxe\n` +
          `${emojis.pacote_ultimate} Ultimate`,
        inline: true,
      },
      {
        name: "Raridades",
        value:
          `${emojis.raridade_comum} Comum\n` +
          `${emojis.raridade_incomum} Incomum\n` +
          `${emojis.raridade_rara} Rara\n` +
          `${emojis.raridade_epica} Épica\n` +
          `${emojis.raridade_lendaria} Lendária`,
        inline: true,
      }
    )
    .setColor(0x470f78)
    .setFooter({ text: "Emojis configurados aparecem em /abrir-pacote, /figurinhas, /catalogo e mais!" })
    .setTimestamp();
}

function buildPanelComponents(emojis: GuildEmojis): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    makeButton("emoji_btn_moedas", "Moedas", emojis.moedas),
    makeButton("emoji_btn_pacote_standard", "Standard", emojis.pacote_standard),
    makeButton("emoji_btn_pacote_deluxe", "Deluxe", emojis.pacote_deluxe),
    makeButton("emoji_btn_pacote_ultimate", "Ultimate", emojis.pacote_ultimate),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    makeButton("emoji_btn_raridade_comum", "Comum", emojis.raridade_comum),
    makeButton("emoji_btn_raridade_incomum", "Incomum", emojis.raridade_incomum),
    makeButton("emoji_btn_raridade_rara", "Rara", emojis.raridade_rara),
    makeButton("emoji_btn_raridade_epica", "Épica", emojis.raridade_epica),
    makeButton("emoji_btn_raridade_lendaria", "Lendária", emojis.raridade_lendaria),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("emoji_btn_reset")
      .setLabel("🔄 Redefinir tudo ao padrão")
      .setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const emojis = await getGuildEmojis(interaction.guildId!);
    await interaction.editReply({
      embeds: [buildPanelEmbed(emojis)],
      components: buildPanelComponents(emojis),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao abrir painel de emojis");
    await interaction.editReply("❌ Erro ao carregar as configurações. Tente novamente.");
  }
}

export async function handleEmojiButton(interaction: ButtonInteraction): Promise<void> {
  // Botão de reset — pede confirmação
  if (interaction.customId === "emoji_btn_reset") {
    const messageId = interaction.message.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`emoji_reset_confirm_${messageId}`)
        .setLabel("✅ Sim, redefinir tudo")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`emoji_reset_cancel_${messageId}`)
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      content: "⚠️ **Tem certeza?** Isso vai **redefinir TODOS os emojis** deste servidor de volta ao padrão.",
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // Botão de emoji individual — customId: emoji_btn_{chave}
  const chave = interaction.customId.slice("emoji_btn_".length) as EmojiChave;
  const nome = NOMES_CHAVES[chave] ?? chave;
  const defaultEmoji = EMOJI_DEFAULTS[chave] ?? "❓";
  const messageId = interaction.message.id;

  const modal = new ModalBuilder()
    .setCustomId(`emoji_modal_${chave}_${messageId}`)
    .setTitle(`Configurar: ${nome}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("emoji_input")
          .setLabel(`Novo emoji para "${nome}"`)
          .setPlaceholder(`Padrão: ${defaultEmoji}   Ex: 💎  ou  <:nome:123456789012345678>`)
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

export async function handleResetButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  // Confirmar reset
  if (interaction.customId.startsWith("emoji_reset_confirm_")) {
    const messageId = interaction.customId.slice("emoji_reset_confirm_".length);

    try {
      // Remove todas as configurações de emoji deste servidor
      await db
        .delete(emojiConfigTable)
        .where(eq(emojiConfigTable.guildId, guildId));

      invalidateGuildCache(guildId);
      const emojis = await getGuildEmojis(guildId);

      // Atualiza o painel original
      if (interaction.channel && messageId) {
        const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            embeds: [buildPanelEmbed(emojis)],
            components: buildPanelComponents(emojis),
          }).catch(() => {});
        }
      }

      await interaction.update({
        content: "✅ Todos os emojis foram redefinidos ao padrão com sucesso!",
        components: [],
      });
    } catch (err) {
      logger.error({ err }, "Erro ao redefinir emojis");
      await interaction.update({
        content: "❌ Erro ao redefinir os emojis. Tente novamente.",
        components: [],
      });
    }
    return;
  }

  // Cancelar reset
  if (interaction.customId.startsWith("emoji_reset_cancel_")) {
    await interaction.update({
      content: "❎ Redefinição cancelada.",
      components: [],
    });
  }
}

export async function handleEmojiModal(interaction: ModalSubmitInteraction): Promise<void> {
  // customId: emoji_modal_{chave}_{messageId}
  const withoutPrefix = interaction.customId.slice("emoji_modal_".length);
  const lastUnder = withoutPrefix.lastIndexOf("_");
  const chave = withoutPrefix.slice(0, lastUnder) as EmojiChave;
  const messageId = withoutPrefix.slice(lastUnder + 1);
  const nome = NOMES_CHAVES[chave] ?? chave;
  const guildId = interaction.guildId!;

  const novoEmoji = interaction.fields.getTextInputValue("emoji_input").trim();

  try {
    // Save using update+insert (no dependency on unique constraint)
    const updated = await db
      .update(emojiConfigTable)
      .set({ emoji: novoEmoji })
      .where(and(eq(emojiConfigTable.guildId, guildId), eq(emojiConfigTable.chave, chave)))
      .returning({ id: emojiConfigTable.id });

    if (updated.length === 0) {
      await db.insert(emojiConfigTable).values({ guildId, chave, emoji: novoEmoji });
    }

    invalidateGuildCache(guildId);
    const emojis = await getGuildEmojis(guildId);

    // Try to update the original panel message
    if (interaction.channel && messageId) {
      const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [buildPanelEmbed(emojis)],
          components: buildPanelComponents(emojis),
        }).catch(() => {});
      }
    }

    await interaction.reply({
      content: `✅ Emoji de **${nome}** atualizado para ${novoEmoji}!`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao salvar emoji config");
    await interaction.reply({
      content: "❌ Erro ao salvar o emoji. Verifique se a tabela `emoji_config` existe no banco de dados.",
      ephemeral: true,
    });
  }
}
