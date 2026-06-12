import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../lib/logger.js";
import {
  getSaldo,
  getNivelRebirth,
  PACKS,
  calcularPreco,
  MAX_NIVEL,
  type TipoPacote,
} from "../lib/moedas.js";
import { getGuildEmojis, getNivelDisplay, type GuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("saldo")
  .setDescription("Veja suas moedas, nível de rebirth e preços dos pacotinhos");

const PACK_EMOJI_CHAVE: Record<TipoPacote, keyof GuildEmojis> = {
  standard: "pacote_standard",
  deluxe: "pacote_deluxe",
  ultimate: "pacote_ultimate",
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const alvo = interaction.user;

  try {
    const [saldo, nivel, emojis, moedaCfg] = await Promise.all([
      getSaldo(guildId, alvo.id),
      getNivelRebirth(guildId, alvo.id),
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);

    const nivelNome = getNivelDisplay(emojis, nivel);
    const isMaxNivel = nivel >= MAX_NIVEL;
    const nomeMoeda = moedaCfg.nomeMoeda;

    const precosBase: Record<TipoPacote, number> = {
      standard: moedaCfg.precoStandard,
      deluxe: moedaCfg.precoDeluxe,
      ultimate: moedaCfg.precoUltimate,
    };

    const linhasPrecos = (Object.entries(PACKS) as [TipoPacote, typeof PACKS[TipoPacote]][])
      .map(([tipo, pack]) => {
        const preco = calcularPreco(precosBase[tipo], nivel);
        const descPct = Math.round((1 - preco / precosBase[tipo]) * 100);
        const descTxt = descPct > 0 ? ` (-${descPct}%)` : "";
        const podeComprar = saldo >= preco ? "✅" : "❌";
        const packEmoji = emojis[PACK_EMOJI_CHAVE[tipo]];
        return `${podeComprar} ${packEmoji} **${pack.nome}**: ${preco} ${nomeMoeda}${descTxt}`;
      })
      .join("\n");

    const proximoNivel = isMaxNivel ? null : getNivelDisplay(emojis, nivel + 1);
    const rebirthTxt = isMaxNivel
      ? "🏅 Nível máximo atingido!"
      : `➡️ Próximo nível: **${proximoNivel}** via \`/rebirth\``;

    const embed = new EmbedBuilder()
      .setTitle(`${emojis.moedas} Saldo de ${alvo.username}`)
      .setColor(0x7B2FBE)
      .setThumbnail(alvo.displayAvatarURL())
      .addFields(
        {
          name: `${emojis.moedas} ${nomeMoeda.charAt(0).toUpperCase() + nomeMoeda.slice(1)}`,
          value: `**${saldo}** ${nomeMoeda}\n*(+${moedaCfg.moedasPorMensagem} por mensagem com ≥5 caracteres)*`,
          inline: true,
        },
        {
          name: "🏆 Nível do álbum",
          value: `**${nivelNome}**\n${rebirthTxt}`,
          inline: true,
        },
        {
          name: "🛒 Preços dos pacotinhos",
          value: linhasPrecos,
          inline: false,
        }
      )
      .setFooter({ text: "✅ = moedas suficientes • ❌ = saldo insuficiente • Use /atm @usuario para ver o saldo de outros" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar saldo");
    await interaction.editReply("❌ Erro ao buscar saldo. Tente novamente.");
  }
}
