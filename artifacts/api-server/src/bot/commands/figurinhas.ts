import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, count, ilike } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

const RARIDADE_ORDEM = ["lendária", "épica", "rara", "incomum", "comum"];

export const data = new SlashCommandBuilder()
  .setName("figurinhas")
  .setDescription("Lista todas as suas figurinhas desbloqueadas em texto")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver as figurinhas de outro usuário").setRequired(false)
  )
  .addStringOption((opt) =>
    opt.setName("busca").setDescription("Filtrar por nome").setRequired(false).setMaxLength(50)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const busca = interaction.options.getString("busca");
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;
  const isSelf = alvoUser.id === interaction.user.id;

  try {
    const [emojis] = await Promise.all([getGuildEmojis(guildId)]);

    const whereClause = busca
      ? and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId),
          ilike(catalogoFigurinhasTable.titulo, `%${busca}%`)
        )
      : and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId)
        );

    const figurinhas = await db
      .select({
        numero: catalogoFigurinhasTable.numero,
        titulo: catalogoFigurinhasTable.titulo,
        raridade: catalogoFigurinhasTable.raridade,
        copias: count(),
      })
      .from(colecaoUsuarioTable)
      .innerJoin(
        catalogoFigurinhasTable,
        eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id)
      )
      .where(whereClause)
      .groupBy(catalogoFigurinhasTable.numero, catalogoFigurinhasTable.titulo, catalogoFigurinhasTable.raridade)
      .orderBy(catalogoFigurinhasTable.numero);

    if (figurinhas.length === 0) {
      if (busca) {
        await interaction.editReply(
          `🔍 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha com **"${busca}"**.`
        );
      } else {
        await interaction.editReply(
          `📭 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha ainda!\n\nUse **/abrir-pacote** para começar.`
        );
      }
      return;
    }

    const contagem: Record<string, number> = {};
    for (const fig of figurinhas) {
      contagem[fig.raridade] = (contagem[fig.raridade] ?? 0) + 1;
    }

    const resumoRaridade = RARIDADE_ORDEM
      .filter((r) => contagem[r])
      .map((r) => `${getRaridadeEmoji(emojis, r)} **${contagem[r]}**`)
      .join("  ·  ");

    const linhas = figurinhas.map((fig) => {
      const emoji = getRaridadeEmoji(emojis, fig.raridade);
      const copiasTxt = fig.copias > 1 ? ` *(×${fig.copias})*` : "";
      return `${emoji} **#${fig.numero}** ${fig.titulo}${copiasTxt}`;
    });

    const totalUnicas = figurinhas.length;
    const totalCopias = figurinhas.reduce((s, f) => s + f.copias, 0);
    const repetidas = figurinhas.filter((f) => f.copias > 1).length;

    const chunks: string[] = [];
    for (let i = 0; i < linhas.length; i += 20) {
      chunks.push(linhas.slice(i, i + 20).join("\n"));
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Figurinhas de ${alvoUser.username}${busca ? ` — "${busca}"` : ""}`)
      .setColor(0x5865f2)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**${totalUnicas}** únicas · **${totalCopias}** cópias no total` +
        (repetidas > 0 ? ` · ♻️ **${repetidas}** com extras` : "") +
        `\n${resumoRaridade}`,
      );

    const maxCampos = Math.min(chunks.length, 5);
    for (let i = 0; i < maxCampos; i++) {
      embed.addFields({
        name: chunks.length > 1 ? `Lista (${i * 20 + 1}–${Math.min((i + 1) * 20, figurinhas.length)})` : "📋 Lista completa",
        value: chunks[i]!,
        inline: false,
      });
    }

    if (chunks.length > 5) {
      embed.addFields({ name: "⚠️ Muitas figurinhas!", value: `...e mais **${figurinhas.length - 100}** no seu álbum`, inline: false });
    }

    embed.setFooter({ text: "Use /ver-album para navegar com imagens · /repetidas para ver cópias extras" });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar figurinhas");
    await interaction.editReply("❌ Erro ao listar. Tente novamente.");
  }
}
