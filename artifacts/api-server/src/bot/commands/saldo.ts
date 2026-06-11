import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getSaldo } from "../lib/moedas.js";

export const data = new SlashCommandBuilder()
  .setName("saldo")
  .setDescription("Veja quantas moedas você tem");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const saldo = await getSaldo(guildId, userId);

  const embed = new EmbedBuilder()
    .setTitle("💰 Seu Saldo")
    .setDescription(`Você tem **${saldo} moedas**!`)
    .setColor(0xf1c40f)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
