import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { logger } from "../lib/logger.js";
import { getGuildEmojis } from "../lib/emoji-config.js";

export const data = new SlashCommandBuilder()
  .setName("biografia")
  .setDescription("Informações sobre o bot de figurinhas do servidor");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const emojis = await getGuildEmojis(interaction.guildId!);

    const embed = new EmbedBuilder()
      .setTitle("📘 Sobre o Bot de Figurinhas")
      .setColor(0x7B2FBE)
      .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
      .setDescription(
        "Um sistema completo de **álbum de figurinhas** integrado ao Discord.\n" +
        "Colecione cartas, abra pacotinhos, troque com amigos e escale o ranking!\n\n" +
        "Cada servidor tem seu próprio catálogo, álbum, economia e personalização total."
      )
      .addFields(
        {
          name: `${emojis.pacote_standard} Pacotinhos`,
          value:
            `${emojis.pacote_standard} **Standard** — 3 figurinhas\n` +
            `${emojis.pacote_deluxe} **Deluxe** — 5 figurinhas\n` +
            `${emojis.pacote_ultimate} **Ultimate** — 10 figurinhas`,
          inline: true,
        },
        {
          name: "📊 Raridades & Chances",
          value:
            `${emojis.raridade_comum} Comum — **55%**\n` +
            `${emojis.raridade_incomum} Incomum — **25%**\n` +
            `${emojis.raridade_rara} Rara — **12%**\n` +
            `${emojis.raridade_epica} Épica — **6%**\n` +
            `${emojis.raridade_lendaria} Lendária — **2%**`,
          inline: true,
        },
        {
          name: "🎮 Como funciona",
          value:
            `${emojis.moedas} Ganhe moedas enviando mensagens no servidor\n` +
            `📦 Compre pacotinhos com suas moedas\n` +
            `🔁 Faça rebirth após completar o álbum para ter descontos\n` +
            `🤝 Troque figurinhas repetidas com outros membros\n` +
            `🏅 Desbloqueie conquistas e suba no ranking`,
          inline: false,
        },
        {
          name: "⚙️ Personalização (Admins)",
          value:
            "• `/configurar-emojis` — Customize todos os emojis do bot\n" +
            "• `/configurar-moedas` — Nome, ganho por mensagem e preços dos pacotes\n" +
            "• `/configurar-figurinhas` — Trocas, doações e cooldowns\n" +
            "• `/criar-figurinha` e `/modificar-figurinha` — Gerencie o catálogo",
          inline: false,
        },
      )
      .setFooter({ text: "Use /help para ver todos os comandos disponíveis" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao exibir biografia");
    await interaction.editReply("❌ Erro ao carregar. Tente novamente.");
  }
}
