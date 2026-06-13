import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  PermissionFlagsBits,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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

export const data = new SlashCommandBuilder()
  .setName("configurar-emojis")
  .setDescription("[ADMIN] Configura todos os emojis usados pelo bot neste servidor")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

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
  nivel_normal: "Nível Normal",
  nivel_prata: "Nível Prata",
  nivel_ouro: "Nível Ouro",
  ranking_primeiro: "Ranking 1º lugar",
  ranking_segundo: "Ranking 2º lugar",
  ranking_terceiro: "Ranking 3º lugar",
  conquista_primeira_figurinha: "Conquista: Primeira Figurinha",
  conquista_dez_figurinhas: "Conquista: Colecionador Iniciante",
  conquista_vinte_cinco_figurinhas: "Conquista: Colecionador Dedicado",
  conquista_cinquenta_figurinhas: "Conquista: Colecionador Lendário",
  conquista_album_completo: "Conquista: Álbum Completo",
  conquista_primeiro_pacote: "Conquista: Primeiro Pacote",
  conquista_sete_pacotes: "Conquista: Rotina Diária",
  conquista_trinta_pacotes: "Conquista: Maratonista",
  conquista_figurinha_lendaria: "Conquista: Sortudo",
  conquista_rebirth_prata: "Conquista: Renascido Prata",
  conquista_rebirth_ouro: "Conquista: Renascido Ouro",
  conquista_primeira_troca: "Conquista: Negociante",
  conquista_cinco_trocas: "Conquista: Mercador",
};

function buildPanelEmbed(emojis: GuildEmojis): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("⚙️ Configuração de Emojis")
    .setDescription("Selecione um emoji nos menus abaixo para alterar.\nAceita emojis padrão `💎` ou customizados `<:nome:ID>`.")
    .addFields(
      {
        name: "💰 Economia & Pacotes",
        value:
          `${emojis.moedas} Moedas · ${emojis.pacote_standard} Standard · ${emojis.pacote_deluxe} Deluxe · ${emojis.pacote_ultimate} Ultimate`,
        inline: false,
      },
      {
        name: "✨ Raridades",
        value:
          `${emojis.raridade_comum} Comum · ${emojis.raridade_incomum} Incomum · ${emojis.raridade_rara} Rara · ${emojis.raridade_epica} Épica · ${emojis.raridade_lendaria} Lendária`,
        inline: false,
      },
      {
        name: "🏆 Níveis & Ranking",
        value:
          `${emojis.nivel_normal} Normal · ${emojis.nivel_prata} Prata · ${emojis.nivel_ouro} Ouro\n` +
          `${emojis.ranking_primeiro} 1º · ${emojis.ranking_segundo} 2º · ${emojis.ranking_terceiro} 3º`,
        inline: false,
      },
      {
        name: "🏅 Conquistas",
        value:
          `${emojis.conquista_primeira_figurinha} Primeira Figurinha · ${emojis.conquista_dez_figurinhas} Col. Iniciante · ${emojis.conquista_vinte_cinco_figurinhas} Col. Dedicado · ${emojis.conquista_cinquenta_figurinhas} Col. Lendário · ${emojis.conquista_album_completo} Álbum Completo\n` +
          `${emojis.conquista_primeiro_pacote} 1º Pacote · ${emojis.conquista_sete_pacotes} Rotina Diária · ${emojis.conquista_trinta_pacotes} Maratonista · ${emojis.conquista_figurinha_lendaria} Sortudo\n` +
          `${emojis.conquista_rebirth_prata} Renascido Prata · ${emojis.conquista_rebirth_ouro} Renascido Ouro · ${emojis.conquista_primeira_troca} Negociante · ${emojis.conquista_cinco_trocas} Mercador`,
        inline: false,
      },
    )
    .setColor(0x470f78)
    .setFooter({ text: "28 emojis configuráveis • Mudanças entram em vigor imediatamente" })
    .setTimestamp();
}

const MENU_GERAL_KEYS: EmojiChave[] = [
  "moedas",
  "pacote_standard", "pacote_deluxe", "pacote_ultimate",
  "raridade_comum", "raridade_incomum", "raridade_rara", "raridade_epica", "raridade_lendaria",
  "nivel_normal", "nivel_prata", "nivel_ouro",
  "ranking_primeiro", "ranking_segundo", "ranking_terceiro",
];

const MENU_CONQUISTAS_KEYS: EmojiChave[] = [
  "conquista_primeira_figurinha", "conquista_dez_figurinhas", "conquista_vinte_cinco_figurinhas",
  "conquista_cinquenta_figurinhas", "conquista_album_completo", "conquista_primeiro_pacote",
  "conquista_sete_pacotes", "conquista_trinta_pacotes", "conquista_figurinha_lendaria",
  "conquista_rebirth_prata", "conquista_rebirth_ouro", "conquista_primeira_troca", "conquista_cinco_trocas",
];

function buildComponents(emojis: GuildEmojis, msgId: string): ActionRowBuilder<any>[] {
  const menuGeral = new StringSelectMenuBuilder()
    .setCustomId(`emoji_sel_geral_${msgId}`)
    .setPlaceholder("🎨 Selecione um emoji para configurar — Geral, Raridades, Ranking...")
    .addOptions(MENU_GERAL_KEYS.map((chave) => ({
      label: NOMES_CHAVES[chave],
      value: chave,
      description: `Atual: ${emojis[chave]}`,
      emoji: { name: emojis[chave].replace(/<a?:(\w+):\d+>/, "$1") },
    })));

  const menuConquistas = new StringSelectMenuBuilder()
    .setCustomId(`emoji_sel_conquistas_${msgId}`)
    .setPlaceholder("🏅 Selecione um emoji para configurar — Conquistas...")
    .addOptions(MENU_CONQUISTAS_KEYS.map((chave) => ({
      label: NOMES_CHAVES[chave],
      value: chave,
      description: `Atual: ${emojis[chave]}`,
    })));

  const resetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("emoji_btn_reset")
      .setLabel("🔄 Redefinir tudo ao padrão")
      .setStyle(ButtonStyle.Danger),
  );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuGeral),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuConquistas),
    resetRow,
  ];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const emojis = await getGuildEmojis(interaction.guildId!);
    const msg = await interaction.editReply({
      embeds: [buildPanelEmbed(emojis)],
      components: buildComponents(emojis, "initial"),
    });
    // Rebuild with actual message ID
    await interaction.editReply({
      embeds: [buildPanelEmbed(emojis)],
      components: buildComponents(emojis, msg.id),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao abrir painel de emojis");
    await interaction.editReply("❌ Erro ao carregar as configurações. Tente novamente.");
  }
}

export async function handleEmojiSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  // customId: emoji_sel_{category}_{msgId}
  const parts = interaction.customId.split("_");
  const msgId = parts[parts.length - 1]!;
  const chave = interaction.values[0] as EmojiChave;
  const nome = NOMES_CHAVES[chave] ?? chave;
  const defaultEmoji = EMOJI_DEFAULTS[chave] ?? "❓";

  const modal = new ModalBuilder()
    .setCustomId(`emoji_modal_${chave}_${msgId}`)
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

// Kept for backward compat with index.ts button handler
export async function handleEmojiButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === "emoji_btn_reset") {
    const messageId = interaction.message.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`emoji_reset_confirm_${messageId}`).setLabel("✅ Sim, redefinir tudo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`emoji_reset_cancel_${messageId}`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: "⚠️ **Tem certeza?** Isso vai **redefinir TODOS os 28 emojis** ao padrão.", components: [row], ephemeral: true });
  }
}

export async function handleResetButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  if (interaction.customId.startsWith("emoji_reset_confirm_")) {
    const messageId = interaction.customId.slice("emoji_reset_confirm_".length);
    try {
      await db.delete(emojiConfigTable).where(eq(emojiConfigTable.guildId, guildId));
      invalidateGuildCache(guildId);
      const emojis = await getGuildEmojis(guildId);
      const msg = await interaction.channel?.messages.fetch(messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildPanelEmbed(emojis)], components: buildComponents(emojis, messageId) }).catch(() => {});
      await interaction.update({ content: "✅ Todos os 28 emojis foram redefinidos ao padrão!", components: [] });
    } catch (err) {
      logger.error({ err }, "Erro ao redefinir emojis");
      await interaction.update({ content: "❌ Erro ao redefinir. Tente novamente.", components: [] });
    }
    return;
  }
  if (interaction.customId.startsWith("emoji_reset_cancel_")) {
    await interaction.update({ content: "❎ Redefinição cancelada.", components: [] });
  }
}

export async function handleEmojiModal(interaction: ModalSubmitInteraction): Promise<void> {
  const withoutPrefix = interaction.customId.slice("emoji_modal_".length);
  const lastUnder = withoutPrefix.lastIndexOf("_");
  const chave = withoutPrefix.slice(0, lastUnder) as EmojiChave;
  const messageId = withoutPrefix.slice(lastUnder + 1);
  const nome = NOMES_CHAVES[chave] ?? chave;
  const guildId = interaction.guildId!;
  const novoEmoji = interaction.fields.getTextInputValue("emoji_input").trim();

  try {
    const updated = await db.update(emojiConfigTable).set({ emoji: novoEmoji })
      .where(and(eq(emojiConfigTable.guildId, guildId), eq(emojiConfigTable.chave, chave)))
      .returning({ id: emojiConfigTable.id });
    if (updated.length === 0) await db.insert(emojiConfigTable).values({ guildId, chave, emoji: novoEmoji });

    invalidateGuildCache(guildId);
    const emojis = await getGuildEmojis(guildId);
    const msg = await interaction.channel?.messages.fetch(messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildPanelEmbed(emojis)], components: buildComponents(emojis, messageId) }).catch(() => {});

    await interaction.reply({ content: `✅ Emoji de **${nome}** atualizado para ${novoEmoji}!`, ephemeral: true });
  } catch (err) {
    logger.error({ err }, "Erro ao salvar emoji");
    await interaction.reply({ content: "❌ Erro ao salvar. Tente novamente.", ephemeral: true });
  }
}
