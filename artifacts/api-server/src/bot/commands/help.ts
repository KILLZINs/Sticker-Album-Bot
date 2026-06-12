import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Mostra todos os comandos do bot de figurinhas");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("📖 Álbum de Figurinhas — Comandos")
    .setColor(0x7B2FBE)
    .setDescription(
      "Bem-vindo ao bot de figurinhas! Colecione, troque e compita com seus amigos!\n\n" +
      "💰 **Ganhe moedas:** envie mensagens com mais de 5 caracteres **(+2 moedas por mensagem)**"
    )
    .addFields(
      {
        name: "💰 Economia",
        value:
          "`/saldo` — Vê suas moedas (e de outro usuário)\n" +
          "`/atm` — Resgata moedas bônus disponíveis\n" +
          "`/dar-moedas @usuário quantia` — Dá moedas para outro usuário",
        inline: false,
      },
      {
        name: "📦 Pacotinhos",
        value:
          "`/abrir-pacote tipo:Standard` — 3 figurinhas • 300 moedas\n" +
          "`/abrir-pacote tipo:Deluxe` — 5 figurinhas • 500 moedas\n" +
          "`/abrir-pacote tipo:Ultimate` — 10 figurinhas • 1000 moedas",
        inline: false,
      },
      {
        name: "📚 Álbum & Coleção",
        value:
          "`/ver-album` — Navega pelo seu álbum com paginação\n" +
          "`/figurinhas` — Lista suas figurinhas em texto\n" +
          "`/catalogo` — Vê o catálogo completo do servidor\n" +
          "`/repetidas` — Mostra suas figurinhas com cópias extras\n" +
          "`/remover-figurinha` — Remove uma figurinha do seu álbum",
        inline: false,
      },
      {
        name: "🔁 Progressão",
        value:
          "`/rebirth` — Reseta o álbum e sobe de nível (preços menores!)\n" +
          "  • ✨ Normal → 🥈 Prata: **-20%** nos pacotes\n" +
          "  • 🥈 Prata → 🥇 Ouro: **-40%** nos pacotes",
        inline: false,
      },
      {
        name: "🤝 Social",
        value:
          "`/dar-figurinha @usuário número` — Doa uma figurinha **repetida** para outro usuário\n" +
          "  ⚠️ Somente nível ✨ Normal • 1 doação a cada 3 dias\n" +
          "`/propor-troca @usuário` — Propõe uma troca com outro usuário\n" +
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
          "`/dar-moedas` — Dá moedas para um usuário\n" +
          "`/configurar-emojis` — Painel para personalizar os emojis do bot\n" +
          "`/forcereset @usuário` — Reseta dados de um usuário",
        inline: false,
      }
    )
    .setFooter({ text: "Figurinhas repetidas são possíveis — lendárias são raras! 🌟" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
