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
    const minChars = moedaCfg.comprimentoMinMensagem;
    const ps = moedaCfg.precoStandard;
    const pd = moedaCfg.precoDeluxe;
    const pu = moedaCfg.precoUltimate;
    const horas = figCfg.cooldownDoacaoHoras;
    const cooldownTxt = horas % 24 === 0 ? `${horas / 24} dias` : `${horas}h`;
    const moedasTroca = figCfg.trocaMoedasHabilitado ? "habilitadas" : "desabilitadas";

    const pages: EmbedBuilder[] = [
      // Página 1 — Economia & Pacotes & Rebirth
      new EmbedBuilder()
        .setTitle("📖 Ajuda — Página 1/3 — Economia & Pacotes")
        .setColor(0x7B2FBE)
        .setDescription(
          `${m} Ganhe **${nome}** enviando mensagens com ≥${minChars} caracteres **(+${ganho} por mensagem)**`
        )
        .addFields(
          {
            name: `${m} Economia`,
            value:
              `\`/saldo\` — Vê suas ${nome}, nível de rebirth e preços dos pacotes\n` +
              `\`/atm @usuário\` — Vê o saldo e nível de outro usuário\n` +
              `\`/ranking\` — Ranking do servidor (filtre por ${nome} ou figurinhas únicas)\n` +
              `\`/stats\` — Estatísticas gerais do servidor (catálogo, recordes, figurinhas raras)\n` +
              `\`/biografia\` — Exibe informações gerais do bot neste servidor`,
            inline: false,
          },
          {
            name: `${emojis.pacote_standard} Pacotinhos`,
            value:
              `\`/abrir-pacote Standard\` — 3 figurinhas • **${ps} ${nome}**\n` +
              `\`/abrir-pacote Deluxe\` — 5 figurinhas • **${pd} ${nome}**\n` +
              `\`/abrir-pacote Ultimate\` — 10 figurinhas • **${pu} ${nome}**\n` +
              `  • Use **◀ Anterior** e **▶ Próxima** para ver cada figurinha com sua imagem\n\n` +
              `**Chances:** ${emojis.raridade_comum} Comum 55% · ${emojis.raridade_incomum} Incomum 25% · ${emojis.raridade_rara} Rara 12% · ${emojis.raridade_epica} Épica 6% · ${emojis.raridade_lendaria} Lendária 2%`,
            inline: false,
          },
          {
            name: "🔁 Rebirth (Progressão)",
            value:
              `\`/rebirth\` — Reseta o álbum e sobe de nível (pacotes mais baratos!)\n` +
              `  ${emojis.nivel_normal} Normal → ${emojis.nivel_prata} Prata: **−20%** nos pacotes\n` +
              `  ${emojis.nivel_prata} Prata → ${emojis.nivel_ouro} Ouro: **−40%** nos pacotes\n` +
              `  ⚠️ Requer completar o catálogo antes de fazer rebirth`,
            inline: false,
          },
        )
        .setFooter({ text: "Página 1/3 — Use os botões ◀ ▶ para navegar" }),

      // Página 2 — Álbum & Social & Trocas
      new EmbedBuilder()
        .setTitle("📖 Ajuda — Página 2/3 — Álbum & Social")
        .setColor(0x7B2FBE)
        .addFields(
          {
            name: "📚 Coleção & Álbum",
            value:
              `\`/ver-album\` — Navega pelas figurinhas **únicas** do seu álbum com imagem\n` +
              `  • Use \`@usuário\` para ver o álbum de outra pessoa · \`busca:\` para filtrar\n` +
              `\`/figurinhas\` — Lista todas as suas figurinhas em texto\n` +
              `\`/catalogo\` — Vê o catálogo completo do servidor\n` +
              `\`/repetidas\` — Mostra suas figurinhas com 2+ cópias (doáveis)\n` +
              `\`/remover-figurinha\` — Remove uma figurinha do seu álbum\n` +
              `\`/conquistas\` — Vê seus badges e marcos desbloqueados\n` +
              `\`/comparar @usuário\` — Compara sua coleção com a de outro usuário`,
            inline: false,
          },
          {
            name: "🤝 Trocas & Doações",
            value:
              `\`/trocar @usuário\` — Propõe uma troca entre dois jogadores\n` +
              `  • Moedas na troca: **${moedasTroca}** neste servidor\n` +
              `  • Limite de ${nome} varia pela raridade da figurinha trocada\n` +
              `  • Proposta expira em 60 s — só o destinatário pode aceitar\n` +
              `\`/dar-figurinha @usuário\` — Doa uma figurinha **repetida** de graça\n` +
              `  • 1 doação a cada **${cooldownTxt}** • Só figurinhas com 2+ cópias`,
            inline: false,
          },
        )
        .setFooter({ text: "Página 2/3 — Use os botões ◀ ▶ para navegar" }),

      // Página 3 — Admin
      new EmbedBuilder()
        .setTitle("📖 Ajuda — Página 3/3 — Administração")
        .setColor(0x7B2FBE)
        .setDescription("Todos os comandos abaixo exigem permissão **Gerenciar Servidor**.")
        .addFields(
          {
            name: "🎴 Gerenciar Figurinhas",
            value:
              `\`/criar-figurinha\` — Adiciona uma nova figurinha ao catálogo\n` +
              `\`/modificar-figurinha\` — Edita título, raridade, imagem, número ou descrição\n` +
              `\`/desbloquear\` — Desbloqueia uma figurinha diretamente para um usuário\n` +
              `\`/apagar-figurinha\` — Remove uma figurinha do catálogo permanentemente`,
            inline: false,
          },
          {
            name: `${m} Gerenciar Economia & Usuários`,
            value:
              `\`/dar-moedas\` — Dá ${nome} para um usuário\n` +
              `\`/forcereset @usuário\` — Reseta todos os dados de um usuário`,
            inline: false,
          },
          {
            name: "⚙️ Configurações",
            value:
              `\`/configurar-emojis\` — Personaliza os **28 emojis** do bot\n` +
              `  • Emoji de moedas · 3 tipos de pacote · 5 raridades · 3 níveis de rebirth\n` +
              `  • 🥇🥈🥉 Ranking · 13 badges de conquistas individuais\n` +
              `\`/configurar-moedas\` — Configura a economia do servidor\n` +
              `  • Nome da moeda · Ganho por mensagem · Mínimo de caracteres por msg\n` +
              `  • Preço dos pacotes Standard, Deluxe e Ultimate\n` +
              `\`/configurar-figurinhas\` — Configura regras de trocas e doações\n` +
              `  • Ativar/desativar moedas em trocas · Limite de moedas por raridade (5)\n` +
              `  • Cooldown de doação · Nível máximo para poder doar/receber`,
            inline: false,
          },
        )
        .setFooter({ text: "Página 3/3 — Use os botões ◀ ▶ para navegar" }),
    ];

    let pagina = 0;

    const buildRow = (pag: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("help_prev")
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pag === 0),
        new ButtonBuilder()
          .setCustomId("help_info")
          .setLabel(`${pag + 1} / ${pages.length}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("help_next")
          .setLabel("Próxima ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pag === pages.length - 1),
      );

    const msg = await interaction.editReply({
      embeds: [pages[pagina]!],
      components: [buildRow(pagina)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "❌ Apenas quem usou o comando pode navegar.", ephemeral: true });
        return;
      }
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
