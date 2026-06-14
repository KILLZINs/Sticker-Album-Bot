import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, gt, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

const RARIDADE_ORDEM = ["lendária", "épica", "rara", "incomum", "comum"];

export const data = new SlashCommandBuilder()
  .setName("repetidas")
  .setDescription("Mostra suas figurinhas repetidas (cópias extras disponíveis para troca/doação)")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Ver as repetidas de outro usuário")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;
  const isSelf = alvoUser.id === interaction.user.id;

  try {
    const emojis = await getGuildEmojis(guildId);

    const repetidas = await db
      .select({
        catalogoId: colecaoUsuarioTable.catalogoId,
        copias: count(),
        titulo: catalogoFigurinhasTable.titulo,
        raridade: catalogoFigurinhasTable.raridade,
        numero: catalogoFigurinhasTable.numero,
      })
      .from(colecaoUsuarioTable)
      .innerJoin(
        catalogoFigurinhasTable,
        eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id)
      )
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId)
        )
      )
      .groupBy(
        colecaoUsuarioTable.catalogoId,
        catalogoFigurinhasTable.titulo,
        catalogoFigurinhasTable.raridade,
        catalogoFigurinhasTable.numero
      )
      .having(gt(count(), 1))
      .orderBy(catalogoFigurinhasTable.numero);

    if (repetidas.length === 0) {
      await interaction.editReply(
        `♻️ ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha repetida!\n\n` +
        `Abra mais pacotinhos para conseguir cópias extras.`
      );
      return;
    }

    // Ordenar por raridade (melhores primeiro)
    const sorted = [...repetidas].sort(
      (a, b) => RARIDADE_ORDEM.indexOf(a.raridade) - RARIDADE_ORDEM.indexOf(b.raridade),
    );

    const linhas = sorted.map((fig) => {
      const emoji = getRaridadeEmoji(emojis, fig.raridade);
      const extras = fig.copias - 1;
      return `${emoji} **#${fig.numero}** ${fig.titulo} — *(+${extras} cópia${extras > 1 ? "s" : ""} extra${extras > 1 ? "s" : ""})*`;
    });

    const totalExtras = repetidas.reduce((acc, f) => acc + (f.copias - 1), 0);
    const contagem: Record<string, number> = {};
    for (const f of repetidas) contagem[f.raridade] = (contagem[f.raridade] ?? 0) + 1;
    const resumo = RARIDADE_ORDEM.filter((r) => contagem[r])
      .map((r) => `${getRaridadeEmoji(emojis, r)} **${contagem[r]}**`)
      .join("  ·  ");

    const embed = new EmbedBuilder()
      .setTitle(`♻️ Figurinhas repetidas — ${alvoUser.username}`)
      .setColor(0x7B2FBE)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**${repetidas.length} figurinha${repetidas.length > 1 ? "s" : ""}** com extras · **${totalExtras} cópia${totalExtras > 1 ? "s" : ""}** disponíveis\n` +
        `${resumo}\n\n` +
        linhas.slice(0, 40).join("\n") +
        (linhas.length > 40 ? `\n*...e mais ${linhas.length - 40} figurinhas*` : ""),
      )
      .setFooter({ text: "Use /trocar para trocar com outros · /dar-figurinha para doar de graça" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar repetidas");
    await interaction.editReply("❌ Erro ao listar as repetidas. Tente novamente.");
  }
}
