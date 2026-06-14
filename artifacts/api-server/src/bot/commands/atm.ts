import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, moedasUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, countDistinct, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { PACKS, calcularPreco, type TipoPacote } from "../lib/moedas.js";
import { getGuildEmojis, getNivelDisplay, type GuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("atm")
  .setDescription("Consulta a conta bancária de outro usuário")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Usuário que deseja consultar")
      .setRequired(true)
  );

const PACK_EMOJI_CHAVE: Record<TipoPacote, keyof GuildEmojis> = {
  standard: "pacote_standard",
  deluxe: "pacote_deluxe",
  ultimate: "pacote_ultimate",
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvo = interaction.options.getUser("usuario", true);
  const guildId = interaction.guildId!;

  if (alvo.bot) {
    await interaction.editReply("❌ Bots não têm conta bancária!");
    return;
  }

  try {
    const [rowResult, colecaoResult, totalCatResult, emojis, moedaCfg] = await Promise.all([
      db
        .select({ saldo: moedasUsuarioTable.saldo, nivelRebirth: moedasUsuarioTable.nivelRebirth })
        .from(moedasUsuarioTable)
        .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, alvo.id)))
        .limit(1),
      db
        .select({ totalUnicas: countDistinct(colecaoUsuarioTable.catalogoId) })
        .from(colecaoUsuarioTable)
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, alvo.id))),
      db.select({ total: count() }).from(catalogoFigurinhasTable).where(eq(catalogoFigurinhasTable.guildId, guildId)),
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);

    const saldo = rowResult[0]?.saldo ?? 0;
    const nivel = rowResult[0]?.nivelRebirth ?? 0;
    const totalUnicas = colecaoResult[0]?.totalUnicas ?? 0;
    const totalCatalogo = totalCatResult[0]?.total ?? 0;
    const nivelNome = getNivelDisplay(emojis, nivel);
    const nomeMoeda = moedaCfg.nomeMoeda;

    const precosBase: Record<TipoPacote, number> = {
      standard: moedaCfg.precoStandard,
      deluxe: moedaCfg.precoDeluxe,
      ultimate: moedaCfg.precoUltimate,
    };

    const linhasPrecos = (Object.entries(PACKS) as [TipoPacote, typeof PACKS[TipoPacote]][])
      .map(([tipo, pack]) => {
        const preco = calcularPreco(precosBase[tipo], nivel);
        const podeComprar = saldo >= preco ? "✅" : "❌";
        const packEmoji = emojis[PACK_EMOJI_CHAVE[tipo]];
        return `${podeComprar} ${packEmoji} **${pack.nome}**: \`${preco}\` ${nomeMoeda}`;
      })
      .join("\n");

    const pct = totalCatalogo > 0 ? Math.round((totalUnicas / totalCatalogo) * 100) : 0;
    const barraLen = 10;
    const preenchido = Math.round((pct / 100) * barraLen);
    const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);

    const embed = new EmbedBuilder()
      .setTitle(`🏧 Conta de ${alvo.displayName}`)
      .setColor(0x2ecc71)
      .setThumbnail(alvo.displayAvatarURL())
      .addFields(
        {
          name: `${emojis.moedas} ${nomeMoeda.charAt(0).toUpperCase() + nomeMoeda.slice(1)}`,
          value: `**${saldo.toLocaleString("pt-BR")}** ${nomeMoeda}`,
          inline: true,
        },
        {
          name: "🏆 Nível",
          value: `**${nivelNome}**`,
          inline: true,
        },
        {
          name: "📚 Coleção",
          value: `**${totalUnicas}**/${totalCatalogo} únicas\n\`${barra}\` ${pct}%`,
          inline: true,
        },
        {
          name: `${emojis.pacote_standard} Pacotes (com desconto do nível)`,
          value: linhasPrecos,
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
