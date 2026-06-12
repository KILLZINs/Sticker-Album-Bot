import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, moedasUsuarioTable } from "@workspace/db";
import { eq, and, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { NIVEL_NOME, PACKS, calcularPreco } from "../lib/moedas.js";

export const data = new SlashCommandBuilder()
  .setName("atm")
  .setDescription("Consulta a conta bancária de outro usuário")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Usuário que deseja consultar")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvo = interaction.options.getUser("usuario", true);
  const guildId = interaction.guildId!;

  if (alvo.bot) {
    await interaction.editReply("❌ Bots não têm conta bancária!");
    return;
  }

  try {
    // Buscar dados de moedas do usuário
    const [row] = await db
      .select({
        saldo: moedasUsuarioTable.saldo,
        nivelRebirth: moedasUsuarioTable.nivelRebirth,
      })
      .from(moedasUsuarioTable)
      .where(
        and(
          eq(moedasUsuarioTable.guildId, guildId),
          eq(moedasUsuarioTable.userId, alvo.id)
        )
      )
      .limit(1);

    const saldo = row?.saldo ?? 0;
    const nivel = row?.nivelRebirth ?? 0;
    const nivelNome = NIVEL_NOME[nivel] ?? "Normal";

    // Contar figurinhas únicas do usuário
    const [{ totalUnicas }] = await db
      .select({ totalUnicas: countDistinct(colecaoUsuarioTable.catalogoId) })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, alvo.id)
        )
      );

    // Preços dos pacotes com o desconto do nível dele
    const pacotes = Object.values(PACKS)
      .map((pack) => {
        const preco = calcularPreco(pack.precoBase, nivel);
        const podeComprar = saldo >= preco ? "✅" : "❌";
        return `${podeComprar} ${pack.emoji} ${pack.nome}: **${preco}**`;
      })
      .join(" · ");

    const embed = new EmbedBuilder()
      .setTitle(`🏧 Conta Bancária — ${alvo.displayName}`)
      .setColor(0x7B2FBE)
      .setThumbnail(alvo.displayAvatarURL())
      .addFields(
        {
          name: "💰 Saldo",
          value: `**${saldo}** moedas`,
          inline: true,
        },
        {
          name: "🏆 Nível",
          value: `**${nivelNome}**`,
          inline: true,
        },
        {
          name: "📚 Figurinhas únicas",
          value: `**${totalUnicas}** desbloqueadas`,
          inline: true,
        },
        {
          name: "🛒 Pacotes (com desconto do nível)",
          value: pacotes,
          inline: false,
        }
      )
      .setFooter({ text: `Consultado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao consultar ATM");
    await interaction.editReply("❌ Erro ao consultar conta. Tente novamente.");
  }
}
