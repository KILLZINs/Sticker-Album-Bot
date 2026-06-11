import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getSaldo, getNivelRebirth, NIVEL_NOME, DESCONTO_NIVEL } from "../lib/moedas.js";

export const data = new SlashCommandBuilder()
  .setName("saldo")
  .setDescription("Veja quantas moedas você tem");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const [saldo, nivel] = await Promise.all([
    getSaldo(guildId, userId),
    getNivelRebirth(guildId, userId),
  ]);

  const nivelNome = NIVEL_NOME[nivel] ?? "✨ Normal";
  const desconto = DESCONTO_NIVEL[nivel] ?? 1.0;
  const descontoTexto =
    desconto < 1.0
      ? `🏷️ Desconto nos pacotinhos: **${Math.round((1 - desconto) * 100)}% off**`
      : `🏷️ Sem desconto nos pacotinhos`;

  const embed = new EmbedBuilder()
    .setTitle("💰 Seu Saldo")
    .setDescription(
      `Você tem **${saldo} moedas**!\n\n` +
        `🔁 Nível Rebirth: **${nivelNome}**\n` +
        descontoTexto
    )
    .setColor(0x470f78)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
