import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

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
      })
      .from(colecaoUsuarioTable)
      .innerJoin(
        catalogoFigurinhasTable,
        eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id)
      )
      .where(whereClause)
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

    const contagem: Record<string, number> = {
      comum: 0, incomum: 0, rara: 0, épica: 0, lendária: 0,
    };
    for (const fig of figurinhas) {
      contagem[fig.raridade] = (contagem[fig.raridade] ?? 0) + 1;
    }

    const linhas = figurinhas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      return `${emoji} **#${fig.numero}** ${fig.titulo}`;
    });

    const chunks: string[] = [];
    for (let i = 0; i < linhas.length; i += 20) {
      chunks.push(linhas.slice(i, i + 20).join("\n"));
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Figurinhas de ${alvoUser.username}${busca ? ` — "${busca}"` : ""}`)
      .setColor(0x7B2FBE)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**Total: ${figurinhas.length} figurinha${figurinhas.length > 1 ? "s" : ""}**\n` +
          `⚪ ${contagem.comum} | 🟢 ${contagem.incomum} | 🔵 ${contagem.rara} | 🟣 ${contagem.épica} | 🌟 ${contagem.lendária}`
      );

    const maxCampos = Math.min(chunks.length, 5);
    for (let i = 0; i < maxCampos; i++) {
      embed.addFields({
        name: chunks.length > 1 ? `Lista (${i * 20 + 1}–${Math.min((i + 1) * 20, figurinhas.length)})` : "Lista",
        value: chunks[i]!,
        inline: false,
      });
    }

    if (chunks.length > 5) {
      embed.addFields({ name: "...", value: `E mais ${figurinhas.length - 100} figurinhas`, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar figurinhas");
    await interaction.editReply("❌ Erro ao listar. Tente novamente.");
  }
}
