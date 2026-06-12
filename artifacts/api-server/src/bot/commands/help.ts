import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { getGuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";
import { getGuildFigurinhaConfig } from "../lib/figurinha-config.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Mostra todos os comandos do bot de figurinhas");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const [emojis, moedaCfg, figCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
      getGuildFigurinhaConfig(guildId),
    ]);

    const m = emojis.moedas;
    const nome = moedaCfg.nomeMoeda;
    const ganho = moedaCfg.moedasPorMensagem;
    const ps = moedaCfg.precoStandard;
    const pd = moedaCfg.precoDeluxe;
    const pu = moedaCfg.precoUltimate;
    const horas = figCfg.cooldownDoacaoHoras;
    const cooldownTxt = horas % 24 === 0 ? `${horas / 24} dias` : `${horas}h`;

    const pages: EmbedBuilder[] = [
      // Página 1 — Economia & Pacotes
      new EmbedBuilder()
        .setTitle("📖 Comandos — Página 1/3 — Economia & Pacotes")
        .setColor(0x7B2FBE)
        .setDescription(`${m} **Ganhe ${nome}** enviando mensagens com mais de 5 caracteres **(+${ganho} por mensagem)**`)
        .addFields(
          {
            name: `${m} Economia`,
            value:
              `\`/saldo\` — Vê suas ${nome}, nível e preços dos pacotes\n` +
              `\`/atm @usuário\` — Vê a conta bancária de outro usuário\n` +
              `\`/ranking\` — Ranking completo com paginação\n` +
              `  • Filtre por 🎴 figurinhas únicas ou ${m} ${nome}`,
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
            name: "🔁 Progressão (Rebirth)",
            value:
              `\`/rebirth\` — Reseta o álbum e sobe de nível (pacotes mais baratos!)\n` +
              `  • ${emojis.nivel_normal} Normal → ${emojis.nivel_prata} Prata: **-20%** nos pacotes\n` +
              `  • ${emojis.nivel_prata} Prata → ${emojis.nivel_ouro} Ouro: **-40%** nos pacotes\n` +
              `  ⚠️ Requer completar o catálogo`,
            inline: false,
          }
        )
        .setFooter({ text: "Página 1/3 — Use os botões para navegar" }),

      // Página 2 — Álbum & Social
      new EmbedBuilder()
        .setTitle("📖 Comandos — Página 2/3 — Álbum & Social")
        .setColor(0x7B2FBE)
        .addFields(
          {
            name: "📚 Álbum & Coleção",
            value:
              `\`/ver-album\` — Navega pelo álbum com imagem e paginação\n` +
              `\`/figurinhas\` — Lista suas figurinhas em texto\n` +
              `\`/catalogo\` — Vê o catálogo completo do servidor\n` +
              `\`/repetidas\` — Mostra suas figurinhas com cópias extras\n` +
              `\`/remover-figurinha\` — Remove uma figurinha do seu álbum\n` +
              `\`/conquistas\` — Vê seus badges e marcos desbloqueados`,
            inline: false,
          },
          {
            name: "🤝 Social & Trocas",
            value:
              `\`/comparar @usuário\` — Compara sua coleção com a de outro usuário\n` +
              `\`/trocar @usuário\` — Propõe uma troca de figurinha\n` +
              `  • Aceita ${m} extras em ambos os lados${figCfg.trocaMoedasHabilitado ? "" : " *(desabilitado neste servidor)*"}\n` +
              `  • Limite de ${nome} varia por raridade da figurinha\n` +
              `\`/dar-figurinha @usuário\` — Doa uma figurinha **repetida**\n` +
              `  • 1 doação a cada **${cooldownTxt}** • Apenas figurinhas extras`,
            inline: false,
          }
        )
        .setFooter({ text: "Página 2/3 — Use os botões para navegar" }),

      // Página 3 — Admin
      new EmbedBuilder()
        .setTitle("📖 Comandos — Página 3/3 — Admin")
        .setColor(0x7B2FBE)
        .setDescription("Comandos exclusivos para membros com permissão **Gerenciar Servidor**.")
        .addFields(
          {
            name: "🎴 Figurinhas",
            value:
              `\`/criar-figurinha\` — Cria uma figurinha no catálogo\n` +
              `\`/modificar-figurinha\` — Edita título, raridade, imagem ou número de uma figurinha existente\n` +
              `\`/desbloquear-figurinha\` — Desbloqueia uma figurinha diretamente para um usuário\n` +
              `\`/apagar-figurinha\` — Apaga uma figurinha do catálogo permanentemente`,
            inline: false,
          },
          {
            name: `${m} Economia & Usuários`,
            value:
              `\`/dar-moedas\` — Dá ${nome} para um usuário\n` +
              `\`/forcereset @usuário\` — Reseta todos os dados de um usuário`,
            inline: false,
          },
          {
            name: "⚙️ Configurações",
            value:
              `\`/configurar-emojis\` — Personaliza emojis de moedas, pacotes, raridades e níveis\n` +
              `\`/configurar-moedas\` — Configura nome, ganho por mensagem e preços dos pacotes\n` +
              `\`/configurar-figurinhas\` — Configura trocas (moedas, limites por raridade) e doações (cooldown, nível máximo)`,
            inline: false,
          }
        )
        .setFooter({ text: "Página 3/3 — Use os botões para navegar" }),
    ];

    let pagina = 0;

    const buildRow = (pag: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("help_prev").setLabel("◀ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId("help_info").setLabel(`${pag + 1} / ${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("help_next").setLabel("Próxima ▶").setStyle(ButtonStyle.Secondary).setDisabled(pag === pages.length - 1),
      );

    const msg = await interaction.editReply({ embeds: [pages[pagina]!], components: [buildRow(pagina)] });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "help_prev" && pagina > 0) pagina--;
      else if (i.customId === "help_next" && pagina < pages.length - 1) pagina++;
      await i.update({ embeds: [pages[pagina]!], components: [buildRow(pagina)] });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (err) {
    logger.error({ err }, "Erro ao exibir help");
    await interaction.editReply("❌ Erro ao carregar o help. Tente novamente.");
  }
}
