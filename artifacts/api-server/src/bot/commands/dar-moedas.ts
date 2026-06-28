import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { addMoedas, getSaldo } from "../lib/moedas.js";
import { getGuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";
import { isAdmin, ADMIN_DENY_MSG } from "../lib/admin-check.js";

export const data = new SlashCommandBuilder()
  .setName("dar-moedas")
  .setDescription("[ADMIN] Dá moedas para um usuário")
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
  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }
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

    const nomeMoeda = moedaCfg.nomeMoeda;

    await addMoedas(guildId, alvo.id, alvo.username, quantidade);
    const novoSaldo = await getSaldo(guildId, alvo.id);

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.moedas} ${nomeMoeda.charAt(0).toUpperCase() + nomeMoeda.slice(1)} Enviadas!`)
      .setDescription(
        `<@${alvo.id}> recebeu **${quantidade.toLocaleString("pt-BR")} ${nomeMoeda}** de <@${interaction.user.id}>!`
      )
      .addFields(
        { name: "💸 Quantidade enviada", value: `+**${quantidade.toLocaleString("pt-BR")}**`, inline: true },
        { name: `${emojis.moedas} Novo saldo`, value: `**${novoSaldo.toLocaleString("pt-BR")}** ${nomeMoeda}`, inline: true }
      )
      .setColor(0xf39c12)
      .setThumbnail(alvo.displayAvatarURL())
      .setFooter({ text: `Admin: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await interaction.followUp({
      ephemeral: false,
      content: `${emojis.moedas} <@${alvo.id}> recebeu **${quantidade.toLocaleString("pt-BR")} ${nomeMoeda}** de <@${interaction.user.id}>!`,
    });
  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Erro ao dar moedas");
    await interaction.editReply(
      `❌ Erro ao dar moedas.\n\`\`\`\n${mensagemErro}\n\`\`\``
    );
  }
}
