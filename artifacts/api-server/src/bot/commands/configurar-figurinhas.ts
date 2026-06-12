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
import { figurinhaConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getGuildFigurinhaConfig,
  invalidateFigurinhaCache,
  FIGURINHA_CONFIG_DEFAULTS,
  FIGURINHA_CONFIG_NOMES,
  type GuildFigurinhaConfig,
  type FigurinhaConfigChave,
} from "../lib/figurinha-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("configurar-figurinhas")
  .setDescription("[ADMIN] Configura as regras de transferência e trocas de figurinhas")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function buildPanelEmbed(guildId: string, config: GuildFigurinhaConfig): Promise<EmbedBuilder> {
  const moedaCfg = await getGuildMoedaConfig(guildId);
  const m = moedaCfg.nomeMoeda;
  const nivelTexto = config.nivelMaximoDoacao < 0
    ? "Todos os níveis"
    : config.nivelMaximoDoacao === 0
      ? "Apenas Normal (0)"
      : config.nivelMaximoDoacao === 1
        ? "Normal + Prata (≤1)"
        : "Todos — Normal, Prata e Ouro (≤2)";

  const horas = config.cooldownDoacaoHoras;
  const dias = horas % 24 === 0 ? `${horas / 24}d` : `${horas}h`;

  return new EmbedBuilder()
    .setTitle("⚙️ Configuração de Transferência de Figurinhas")
    .setColor(0x9B59B6)
    .addFields(
      {
        name: "🔄 Trocas",
        value:
          `**Moedas em trocas:** ${config.trocaMoedasHabilitado ? "✅ Habilitado" : "❌ Desabilitado"}\n` +
          `**Máx. por raridade:**\n` +
          `⚪ Comum: **${config.moedasMaxComum}** ${m}\n` +
          `🟢 Incomum: **${config.moedasMaxIncomum}** ${m}\n` +
          `🔵 Rara: **${config.moedasMaxRara}** ${m}\n` +
          `🟣 Épica: **${config.moedasMaxEpica}** ${m}\n` +
          `🌟 Lendária: **${config.moedasMaxLendaria}** ${m}`,
        inline: true,
      },
      {
        name: "🎁 Doações (/dar-figurinha)",
        value:
          `**Cooldown:** ${dias} entre doações\n` +
          `**Quem pode doar/receber:** ${nivelTexto}\n\n` +
          `*(Nível: 0=só Normal, 1=+Prata, 2=todos, -1=sem limite)*`,
        inline: true,
      }
    )
    .setFooter({ text: "Clique nos botões para alterar. Mudanças entram em vigor imediatamente." })
    .setTimestamp();
}

function buildPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fig_btn_troca_moedas_habilitado").setLabel("💱 Moedas em trocas").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fig_btn_cooldown_doacao_horas").setLabel("⏳ Cooldown de doação").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_btn_nivel_maximo_doacao").setLabel("🏆 Nível máx. para doar").setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fig_btn_moedas_max_comum").setLabel("⚪ Máx. Comum").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_btn_moedas_max_incomum").setLabel("🟢 Máx. Incomum").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_btn_moedas_max_rara").setLabel("🔵 Máx. Rara").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_btn_moedas_max_epica").setLabel("🟣 Máx. Épica").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fig_btn_moedas_max_lendaria").setLabel("🌟 Máx. Lendária").setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fig_btn_reset").setLabel("🔄 Redefinir tudo ao padrão").setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const config = await getGuildFigurinhaConfig(interaction.guildId!);
    await interaction.editReply({
      embeds: [await buildPanelEmbed(interaction.guildId!, config)],
      components: buildPanelComponents(),
    });
  } catch (err) {
    logger.error({ err }, "Erro ao abrir painel de figurinha config");
    await interaction.editReply("❌ Erro ao carregar configurações. Verifique se a tabela `figurinha_config` existe no banco de dados.");
  }
}

export async function handleFigurinhaButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  if (interaction.customId === "fig_btn_reset") {
    const msgId = interaction.message.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`fig_reset_confirm_${msgId}`).setLabel("✅ Sim, redefinir tudo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`fig_reset_cancel_${msgId}`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: "⚠️ Isso vai redefinir **todas as configurações de figurinhas** ao padrão.", components: [row], ephemeral: true });
    return;
  }

  const chave = interaction.customId.slice("fig_btn_".length) as FigurinhaConfigChave;
  const nome = FIGURINHA_CONFIG_NOMES[chave] ?? chave;
  const defaultValor = FIGURINHA_CONFIG_DEFAULTS[chave] ?? "?";
  const msgId = interaction.message.id;

  const isBoolean = chave === "troca_moedas_habilitado";
  const placeholder = isBoolean
    ? `Padrão: ${defaultValor}   Digite: true  ou  false`
    : `Padrão: ${defaultValor}   Número inteiro (ex: ${defaultValor})`;

  const modal = new ModalBuilder()
    .setCustomId(`fig_modal_${chave}_${msgId}`)
    .setTitle(`Configurar: ${nome}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("fig_input")
          .setLabel(`Novo valor para "${nome}"`)
          .setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(10)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

export async function handleFigurinhaResetButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  if (interaction.customId.startsWith("fig_reset_confirm_")) {
    const msgId = interaction.customId.slice("fig_reset_confirm_".length);
    try {
      await db.delete(figurinhaConfigTable).where(eq(figurinhaConfigTable.guildId, guildId));
      invalidateFigurinhaCache(guildId);
      const config = await getGuildFigurinhaConfig(guildId);
      const msg = await interaction.channel?.messages.fetch(msgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [await buildPanelEmbed(guildId, config)], components: buildPanelComponents() }).catch(() => {});
      await interaction.update({ content: "✅ Configurações de figurinhas redefinidas ao padrão!", components: [] });
    } catch (err) {
      logger.error({ err }, "Erro ao redefinir figurinha config");
      await interaction.update({ content: "❌ Erro ao redefinir. Tente novamente.", components: [] });
    }
    return;
  }

  if (interaction.customId.startsWith("fig_reset_cancel_")) {
    await interaction.update({ content: "❎ Redefinição cancelada.", components: [] });
  }
}

export async function handleFigurinhaModal(interaction: ModalSubmitInteraction): Promise<void> {
  const withoutPrefix = interaction.customId.slice("fig_modal_".length);
  const lastUnder = withoutPrefix.lastIndexOf("_");
  const chave = withoutPrefix.slice(0, lastUnder) as FigurinhaConfigChave;
  const msgId = withoutPrefix.slice(lastUnder + 1);
  const nome = FIGURINHA_CONFIG_NOMES[chave] ?? chave;
  const guildId = interaction.guildId!;

  let novoValor = interaction.fields.getTextInputValue("fig_input").trim().toLowerCase();

  const isBoolean = chave === "troca_moedas_habilitado";
  if (isBoolean) {
    if (novoValor !== "true" && novoValor !== "false") {
      await interaction.reply({ content: `❌ Valor inválido! Digite \`true\` ou \`false\`.`, ephemeral: true }); return;
    }
  } else {
    const num = parseInt(novoValor, 10);
    const minVal = chave === "nivel_maximo_doacao" ? -1 : 0;
    if (isNaN(num) || num < minVal) {
      await interaction.reply({ content: `❌ Valor inválido! Para **${nome}** o valor precisa ser um número inteiro ≥ ${minVal}.`, ephemeral: true }); return;
    }
    novoValor = String(num);
  }

  try {
    const updated = await db.update(figurinhaConfigTable).set({ valor: novoValor })
      .where(and(eq(figurinhaConfigTable.guildId, guildId), eq(figurinhaConfigTable.chave, chave)))
      .returning({ id: figurinhaConfigTable.id });
    if (updated.length === 0) await db.insert(figurinhaConfigTable).values({ guildId, chave, valor: novoValor });

    invalidateFigurinhaCache(guildId);
    const config = await getGuildFigurinhaConfig(guildId);
    const msg = await interaction.channel?.messages.fetch(msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [await buildPanelEmbed(guildId, config)], components: buildPanelComponents() }).catch(() => {});

    await interaction.reply({ content: `✅ **${nome}** atualizado para \`${novoValor}\`!`, ephemeral: true });
  } catch (err) {
    logger.error({ err }, "Erro ao salvar figurinha config");
    await interaction.reply({ content: "❌ Erro ao salvar. Verifique se a tabela `figurinha_config` existe no banco.", ephemeral: true });
  }
}
