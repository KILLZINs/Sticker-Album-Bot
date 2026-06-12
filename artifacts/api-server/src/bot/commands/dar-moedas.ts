import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { addMoedas, getSaldo } from "../lib/moedas.js";

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
    await addMoedas(guildId, alvo.id, alvo.username, quantidade);
    const novoSaldo = await getSaldo(guildId, alvo.id);

    const embed = new EmbedBuilder()
      .setTitle("💰 Moedas enviadas!")
      .setDescription(
        `**<@${alvo.id}>** recebeu **${quantidade} moedas** de <@${interaction.user.id}>!`
      )
      .addFields(
        { name: "💸 Moedas dadas", value: `+${quantidade}`, inline: true },
        { name: "💰 Novo saldo", value: `${novoSaldo} moedas`, inline: true }
      )
      .setColor(0x470f78)
      .setThumbnail(alvo.displayAvatarURL())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await interaction.followUp({
      content: `🎁 <@${alvo.id}> recebeu **${quantidade} moedas** de <@${interaction.user.id}>! 💰`,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao dar moedas");
    await interaction.editReply("❌ Erro ao dar moedas. Tente novamente.");
  }
}
