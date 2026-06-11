import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Mostra todos os comandos do bot de figurinhas");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("📖 Álbum de Figurinhas — Comandos")
    .setColor(0x5865f2)
    .setDescription(
      "Bem-vindo ao bot de figurinhas! Colecione, troque e compita com seus amigos!\n\n" +
        "💰 **Ganhe moedas:** envie mensagens com mais de 8 caracteres **(+2 moedas)**"
    )
    .addFields(
      {
        name: "📦 Pacotinhos",
        value:
          "`/abrir-pacote tipo:Standard` — 3 figurinhas • 300 moedas\n" +
          "`/abrir-pacote tipo:Deluxe` — 5 figurinhas • 500 moedas\n" +
          "`/abrir-pacote tipo:Ultimate` — 10 figurinhas • 1000 moedas",
        inline: false,
      },
      {
        name: "📚 Álbum",
        value:
          "`/ver-album` — Navega pelo seu álbum com paginação\n" +
          "`/figurinhas` — Lista suas figurinhas em texto\n" +
          "`/catalogo` — Vê o catálogo completo do servidor\n" +
          "`/remover-figurinha` — Remove uma figurinha do seu álbum",
        inline: false,
      },
      {
        name: "🔁 Progressão",
        value:
          "`/rebirth` — Reseta o álbum e sobe de nível (preços menores!)\n" +
          "  • ✨ Normal → 🥈 Prata: -20% nos pacotes\n" +
          "  • 🥈 Prata → 🥇 Ouro: -40% nos pacotes",
        inline: false,
      },
      {
        name: "🤝 Social",
        value:
          "`/propor-troca` — Propõe uma troca com outro usuário\n" +
          "`/ranking` — Top 10 colecionadores do servidor\n" +
          "`/conquistas` — Vê seus marcos desbloqueados",
        inline: false,
      },
      {
        name: "⚙️ Admin",
        value:
          "`/criar-figurinha` — Cria uma figurinha no catálogo\n" +
          "`/desbloquear-figurinha` — Desbloqueia figurinha para um usuário\n" +
          "`/apagar-figurinha` — Apaga figurinha do catálogo permanentemente\n" +
          "`/forcereset @usuário` — Reseta dados do usuário (rebirth, figurinhas, etc.) mantendo dados de admin intactos",
        inline: false,
      }
    )
    .setFooter({ text: "Figurinhas repetidas são possíveis — lendárias são raras! 🌟" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}