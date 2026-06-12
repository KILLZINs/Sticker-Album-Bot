import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { logger } from "../lib/logger.js";
import { getGuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Mostra todos os comandos do bot de figurinhas");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const [emojis, moedaCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);

    const m = emojis.moedas;
    const nome = moedaCfg.nomeMoeda;
    const ganho = moedaCfg.moedasPorMensagem;
    const ps = moedaCfg.precoStandard;
    const pd = moedaCfg.precoDeluxe;
    const pu = moedaCfg.precoUltimate;

    const embed = new EmbedBuilder()
      .setTitle("📖 Álbum de Figurinhas — Comandos")
      .setColor(0x7B2FBE)
      .setDescription(
        `Bem-vindo ao bot de figurinhas! Colecione, troque e compita com seus amigos!\n\n` +
        `${m} **Ganhe ${nome}:** envie mensagens com mais de 5 caracteres **(+${ganho} ${nome} por mensagem)**\n` +
        `> Use \`/biografia\` para saber mais sobre o bot.`
      )
      .addFields(
        {
          name: `${m} Economia`,
          value:
            `\`/saldo\` — Vê suas ${nome} e preços dos pacotes\n` +
            `\`/saldo @usuário\` — Vê o saldo de outro usuário\n` +
            `\`/atm @usuário\` — Consulta a conta bancária de outro usuário`,
          inline: false,
        },
        {
          name: `${emojis.pacote_standard} Pacotinhos`,
          value:
            `\`/abrir-pacote Standard\` — 3 figurinhas • **${ps} ${nome}**\n` +
            `\`/abrir-pacote Deluxe\` — 5 figurinhas • **${pd} ${nome}**\n` +
            `\`/abrir-pacote Ultimate\` — 10 figurinhas • **${pu} ${nome}**\n\n` +
            `**Chances de drop:**\n` +
            `${emojis.raridade_comum} Comum **55%** · ${emojis.raridade_incomum} Incomum **25%** · ${emojis.raridade_rara} Rara **12%** · ${emojis.raridade_epica} Épica **6%** · ${emojis.raridade_lendaria} Lendária **2%**`,
          inline: false,
        },
        {
          name: "📚 Álbum & Coleção",
          value:
            `\`/ver-album\` — Navega pelo álbum com imagem e paginação\n` +
            `\`/figurinhas\` — Lista suas figurinhas em texto\n` +
            `\`/catalogo\` — Vê o catálogo completo do servidor\n` +
            `\`/repetidas\` — Mostra suas figurinhas com cópias extras\n` +
            `\`/remover-figurinha\` — Remove uma figurinha do seu álbum`,
          inline: false,
        },
        {
          name: "🔁 Progressão (Rebirth)",
          value:
            `\`/rebirth\` — Reseta o álbum e sobe de nível (pacotes mais baratos!)\n` +
            `  • ${emojis.nivel_normal} Normal → ${emojis.nivel_prata} Prata: **-20%** nos pacotes\n` +
            `  • ${emojis.nivel_prata} Prata → ${emojis.nivel_ouro} Ouro: **-40%** nos pacotes\n` +
            `  ⚠️ Requer ter pelo menos 1 figurinha de cada raridade`,
          inline: false,
        },
        {
          name: "🤝 Social",
          value:
            `\`/dar-figurinha @usuário número\` — Doa uma figurinha **repetida**\n` +
            `  ⚠️ Somente nível ${emojis.nivel_normal} Normal • 1 doação a cada 3 dias\n` +
            `\`/propor-troca @usuário\` — Propõe uma troca de figurinha\n` +
            `\`/comparar @usuário\` — Compara sua coleção com a de outro usuário\n` +
            `\`/ranking\` — Ranking completo com paginação (filtre por figurinhas ou ${nome})\n` +
            `\`/conquistas\` — Vê seus marcos e badges desbloqueados`,
          inline: false,
        },
        {
          name: "⚙️ Admin",
          value:
            `\`/criar-figurinha\` — Cria uma figurinha no catálogo\n` +
            `\`/desbloquear-figurinha\` — Desbloqueia figurinha para um usuário\n` +
            `\`/apagar-figurinha\` — Apaga figurinha do catálogo permanentemente\n` +
            `\`/dar-moedas\` — Dá ${nome} para um usuário\n` +
            `\`/forcereset @usuário\` — Reseta todos os dados de um usuário\n` +
            `\`/configurar-emojis\` — Personaliza emojis de moedas, pacotes, raridades e níveis\n` +
            `\`/configurar-moedas\` — Configura nome, ganho por mensagem e preços`,
          inline: false,
        }
      )
      .setFooter({ text: `Lendárias são raras! ${emojis.raridade_lendaria} 2% de chance` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao exibir help");
    await interaction.editReply("❌ Erro ao carregar o help. Tente novamente.");
  }
}
