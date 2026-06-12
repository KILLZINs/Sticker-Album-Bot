import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../lib/logger.js";
import {
  getSaldo,
  getNivelRebirth,
  NIVEL_NOME,
  PACKS,
  calcularPreco,
  MAX_NIVEL,
} from "../lib/moedas.js";

export const data = new SlashCommandBuilder()
  .setName("saldo")
  .setDescription("Veja suas moedas, nível de rebirth e preços dos pacotinhos")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver saldo de outro usuário").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvo = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;
  const isSelf = alvo.id === interaction.user.id;

  try {
    const saldo = await getSaldo(guildId, alvo.id);
    const nivel = await getNivelRebirth(guildId, alvo.id);
    const nivelNome = NIVEL_NOME[nivel] ?? "Normal";
    const isMaxNivel = nivel >= MAX_NIVEL;

    // Montar tabela de preços com desconto atual
    const linhasPrecos = Object.values(PACKS)
      .map((pack) => {
        const preco = calcularPreco(pack.precoBase, nivel);
        const descPct = Math.round((1 - preco / pack.precoBase) * 100);
        const descTxt = descPct > 0 ? ` (-${descPct}%)` : "";
        const podeComprar = saldo >= preco ? "✅" : "❌";
        return `${podeComprar} ${pack.emoji} **${pack.nome}**: ${preco} moedas${descTxt}`;
      })
      .join("\n");

    const proximoNivel = isMaxNivel ? null : NIVEL_NOME[nivel + 1];
    const rebirthTxt = isMaxNivel
      ? "🥇 Nível máximo atingido!"
      : `➡️ Próximo nível: **${proximoNivel}** via \`/rebirth\``;

    const embed = new EmbedBuilder()
      .setTitle(`💰 Saldo de ${alvo.username}`)
      .setColor(0xf1c40f)
      .setThumbnail(alvo.displayAvatarURL())
      .addFields(
        {
          name: "💰 Moedas",
          value: `**${saldo}** moedas\n*(+2 por mensagem com ≥5 caracteres)*`,
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
      .setFooter({
        text: isSelf
          ? "✅ = você tem moedas suficientes • ❌ = saldo insuficiente"
          : `Consultando saldo de ${alvo.username}`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar saldo");
    await interaction.editReply("❌ Erro ao buscar saldo. Tente novamente.");
  }
}
