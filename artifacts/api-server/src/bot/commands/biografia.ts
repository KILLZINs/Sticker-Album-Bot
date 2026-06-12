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
      .setTitle("╋━ Skying — Bot de Figurinhas")
      .setColor(0x7B2FBE)
      .setDescription(
        "Um bot de álbum de figurinhas feito **exclusivamente** para o servidor **╋━ Skying**.\n" +
        "Colecione figurinhas, abra pacotinhos, troque com amigos e suba no ranking!"
      )
      .addFields(
        {
          name: "👨‍💻 Criado por",
          value: "**DJ Isaac** — MOD do servidor ╋━ Skying",
          inline: false,
        },
        {
          name: "🃏 O que é?",
          value:
            "Um sistema de coleção de figurinhas integrado ao Discord. " +
            "Admins criam as figurinhas, jogadores ganham moedas enviando mensagens e abrem pacotinhos para desbloquear novas cartas. " +
            "Cada servidor tem seu próprio catálogo, álbum e economia.",
          inline: false,
        },
        {
          name: "✨ Funções principais",
          value:
            `${emojis.pacote_standard} **Pacotinhos** — Standard, Deluxe e Ultimate com figurinhas aleatórias\n` +
            `${emojis.moedas} **Economia** — Ganhe moedas enviando mensagens no servidor\n` +
            `📖 **Álbum** — Navegue pelas suas figurinhas com imagens\n` +
            `🔁 **Rebirth** — Suba de nível para ter desconto nos pacotes\n` +
            `🤝 **Trocas** — Troque figurinhas repetidas com outros membros\n` +
            `🏆 **Ranking** — Veja quem tem mais figurinhas únicas\n` +
            `🎖️ **Conquistas** — Desbloqueie badges por completar desafios`,
          inline: false,
        },
        {
          name: "📊 Raridades & Chances de Drop",
          value:
            `${emojis.raridade_comum} **Comum** — 55%\n` +
            `${emojis.raridade_incomum} **Incomum** — 25%\n` +
            `${emojis.raridade_rara} **Rara** — 12%\n` +
            `${emojis.raridade_epica} **Épica** — 6%\n` +
            `${emojis.raridade_lendaria} **Lendária** — 2%`,
          inline: true,
        },
        {
          name: "⚙️ Personalização (Admin)",
          value:
            "Os admins podem personalizar:\n" +
            "• Emojis de raridade e pacotes — `/configurar-emojis`\n" +
            "• Nome da moeda, ganho por mensagem e preços — `/configurar-moedas`",
          inline: true,
        }
      )
      .setFooter({ text: "╋━ Skying • Use /help para ver todos os comandos" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao exibir biografia");
    await interaction.editReply("❌ Erro ao carregar. Tente novamente.");
  }
}
