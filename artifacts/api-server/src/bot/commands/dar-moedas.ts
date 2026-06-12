import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { addMoedas, getSaldo } from "../lib/moedas.js";
import { getGuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("dar-moedas")
  .setDescription("[ADMIN] Dá moedas para um usuário")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Usuário que vai receber as moedas")
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("quantidade")
      .setDescription("Quantidade de moedas a dar")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100000)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const alvo = interaction.options.getUser("usuario", true);
  const quantidade = interaction.options.getInteger("quantidade", true);
  const guildId = interaction.guildId!;

  if (alvo.bot) {
    await interaction.editReply("❌ Não é possível dar moedas para um bot!");
    return;
  }

  try {
    const [emojis, moedaCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);

    await addMoedas(guildId, alvo.id, alvo.username, quantidade);
    const novoSaldo = await getSaldo(guildId, alvo.id);
    const nomeMoeda = moedaCfg.nomeMoeda;

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.moedas} ${nomeMoeda.charAt(0).toUpperCase() + nomeMoeda.slice(1)} enviadas!`)
      .setDescription(
        `**<@${alvo.id}>** recebeu **${quantidade} ${nomeMoeda}** de <@${interaction.user.id}>!`
      )
      .addFields(
        { name: "💸 Enviado", value: `+${quantidade}`, inline: true },
        { name: `${emojis.moedas} Novo saldo`, value: `${novoSaldo} ${nomeMoeda}`, inline: true }
      )
      .setColor(0x470f78)
      .setThumbnail(alvo.displayAvatarURL())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await interaction.followUp({
      content: `${emojis.moedas} <@${alvo.id}> recebeu **${quantidade} ${nomeMoeda}** de <@${interaction.user.id}>!`,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao dar moedas");
    await interaction.editReply("❌ Erro ao dar moedas. Tente novamente.");
  }
}
