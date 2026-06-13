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
} from "discord.js";
import { db } from "@workspace/db";
import { moedaConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getGuildMoedaConfig,
  invalidateMoedaCache,
  MOEDA_DEFAULTS,
  MOEDA_NOMES,
  type GuildMoedaConfig,
  type MoedaChave,
} from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("configurar-moedas")
  .setDescription("[ADMIN] Configura o nome da moeda, ganho por mensagem e preços dos pacotes")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function buildPanelEmbed(config: GuildMoedaConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("⚙️ Configuração de Moedas")
    .setDescription(
      "Clique em um botão abaixo para alterar a configuração.\n" +
      "Os preços dos pacotes são em número inteiro (ex: `300`)."
    )
    .addFields(
      {
        name: "💰 Economia",
        value:
          `**Nome da moeda:** ${config.nomeMoeda}\n` +
          `**Ganho por mensagem:** +${config.moedasPorMensagem} ${config.nomeMoeda}\n` +
          `**Mínimo de caracteres:** ≥${config.comprimentoMinMensagem} para ganhar ${config.nomeMoeda}`,
        inline: false,
      },
      {
        name: "📦 Preços dos Pacotes",
        value:
          `**Standard** (3 figurinhas): ${config.precoStandard} ${config.nomeMoeda}\n` +
          `**Deluxe** (5 figurinhas): ${config.precoDeluxe} ${config.nomeMoeda}\n` +
          `**Ultimate** (10 figurinhas): ${config.precoUltimate} ${config.nomeMoeda}`,
        inline: false,
      }
    )
    .setColor(0x2b7a0b)
    .setFooter({ text: "As alterações entram em vigor imediatamente em todos os comandos." })
    .setTimestamp();
}

function buildPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("moeda_btn_nome_moeda")
      .setLabel("💰 Nome da Moeda")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("moeda_btn_moedas_por_mensagem")
      .setLabel("✉️ Ganho por mensagem")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("moeda_btn_comprimento_min_mensagem")
      .setLabel("🔤 Mín. caracteres")
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("moeda_btn_preco_standard")
      .setLabel("📦 Preço Standard")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("moeda_btn_preco_deluxe")
      .setLabel("🎁 Preço Deluxe")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("moeda_btn_preco_ultimate")
      .setLabel("⭐ Preço Ultimate")
      .setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("moeda_btn_reset")
      .setLabel("🔄 Redefinir tudo ao padrão")
      .setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const config = await getGuildMoedaConfig(interaction.guildId!);
    await interaction.editReply({
      embeds: [buildPanelEmbed(config)],
      components: buildPanelComponents(),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao abrir painel de moeda config");
    await interaction.editReply("❌ Erro ao carregar as configurações. Tente novamente.");
  }
}

export async function handleMoedaButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === "moeda_btn_reset") {
    const messageId = interaction.message.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`moeda_reset_confirm_${messageId}`)
        .setLabel("✅ Sim, redefinir tudo")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`moeda_reset_cancel_${messageId}`)
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      content: "⚠️ **Tem certeza?** Isso vai **redefinir TODAS as configurações de moeda** deste servidor ao padrão.",
      components: [row],
      ephemeral: true,
    });
    return;
  }

  const chave = interaction.customId.slice("moeda_btn_".length) as MoedaChave;
  const nome = MOEDA_NOMES[chave] ?? chave;
  const defaultValor = MOEDA_DEFAULTS[chave] ?? "?";
  const messageId = interaction.message.id;

  const isNome = chave === "nome_moeda";
  const placeholder = isNome
    ? `Padrão: ${defaultValor}   Ex: moedas, gemas, estrelas (máx. 20 caracteres)`
    : `Padrão: ${defaultValor}   Apenas número inteiro (ex: ${defaultValor})`;

  const modal = new ModalBuilder()
    .setCustomId(`moeda_modal_${chave}_${messageId}`)
    .setTitle(`Configurar: ${nome}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("moeda_input")
          .setLabel(`Novo valor para "${nome}"`)
          .setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(isNome ? 20 : 6)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

export async function handleMoedaResetButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  if (interaction.customId.startsWith("moeda_reset_confirm_")) {
    const messageId = interaction.customId.slice("moeda_reset_confirm_".length);

    try {
      await db.delete(moedaConfigTable).where(eq(moedaConfigTable.guildId, guildId));
      invalidateMoedaCache(guildId);
      const config = await getGuildMoedaConfig(guildId);

      if (interaction.channel && messageId) {
        const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            embeds: [buildPanelEmbed(config)],
            components: buildPanelComponents(),
          }).catch(() => {});
        }
      }

      await interaction.update({
        content: "✅ Todas as configurações de moeda foram redefinidas ao padrão!",
        components: [],
      });
    } catch (err) {
      logger.error({ err }, "Erro ao redefinir moeda config");
      await interaction.update({ content: "❌ Erro ao redefinir. Tente novamente.", components: [] });
    }
    return;
  }

  if (interaction.customId.startsWith("moeda_reset_cancel_")) {
    await interaction.update({ content: "❎ Redefinição cancelada.", components: [] });
  }
}

export async function handleMoedaModal(interaction: ModalSubmitInteraction): Promise<void> {
  const withoutPrefix = interaction.customId.slice("moeda_modal_".length);
  const lastUnder = withoutPrefix.lastIndexOf("_");
  const chave = withoutPrefix.slice(0, lastUnder) as MoedaChave;
  const messageId = withoutPrefix.slice(lastUnder + 1);
  const nome = MOEDA_NOMES[chave] ?? chave;
  const guildId = interaction.guildId!;

  let novoValor = interaction.fields.getTextInputValue("moeda_input").trim();

  const isNome = chave === "nome_moeda";
  if (!isNome) {
    const num = parseInt(novoValor, 10);
    if (isNaN(num) || num < 1) {
      await interaction.reply({
        content: `❌ Valor inválido! Para **${nome}** o valor precisa ser um número inteiro maior que 0.`,
        ephemeral: true,
      });
      return;
    }
    novoValor = String(num);
  }

  try {
    const updated = await db
      .update(moedaConfigTable)
      .set({ valor: novoValor })
      .where(and(eq(moedaConfigTable.guildId, guildId), eq(moedaConfigTable.chave, chave)))
      .returning({ id: moedaConfigTable.id });

    if (updated.length === 0) {
      await db.insert(moedaConfigTable).values({ guildId, chave, valor: novoValor });
    }

    invalidateMoedaCache(guildId);
    const config = await getGuildMoedaConfig(guildId);

    if (interaction.channel && messageId) {
      const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [buildPanelEmbed(config)],
          components: buildPanelComponents(),
        }).catch(() => {});
      }
    }

    await interaction.reply({
      content: `✅ **${nome}** atualizado para \`${novoValor}\`!`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao salvar moeda config");
    await interaction.reply({
      content: "❌ Erro ao salvar. Verifique se a tabela `moeda_config` existe no banco de dados.",
      ephemeral: true,
    });
  }
}
