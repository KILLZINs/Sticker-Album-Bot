import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { figurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
  .setDescription("Lista todas as suas figurinhas em texto")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Ver as figurinhas de outro usuário")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;

  try {
    const figurinhas = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, userId)
        )
      )
      .orderBy(figurinhasTable.numero);

    if (figurinhas.length === 0) {
      await interaction.editReply(
        `📭 ${alvoUser.id === interaction.user.id ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha ainda!`
      );
      return;
    }

    const contagem: Record<string, number> = {
      comum: 0,
      incomum: 0,
      rara: 0,
      épica: 0,
      lendária: 0,
    };
    for (const fig of figurinhas) {
      contagem[fig.raridade] = (contagem[fig.raridade] ?? 0) + 1;
    }

    const linhas = figurinhas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      const rep = fig.repetida ? " ♻️" : "";
      return `${emoji} **#${fig.numero}** ${fig.titulo}${rep}`;
    });

    // Dividir em chunks de 20 por campo
    const chunks: string[] = [];
    for (let i = 0; i < linhas.length; i += 20) {
      chunks.push(linhas.slice(i, i + 20).join("\n"));
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Figurinhas de ${alvoUser.username}`)
      .setColor(0x5865f2)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**Total: ${figurinhas.length} figurinha${figurinhas.length > 1 ? "s" : ""}**\n` +
        `⚪ ${contagem.comum} comum | 🟢 ${contagem.incomum} incomum | 🔵 ${contagem.rara} rara | 🟣 ${contagem.épica} épica | 🌟 ${contagem.lendária} lendária`
      )
      .setFooter({ text: "♻️ = repetida" });

    // Adicionar campos com as figurinhas (até 5 campos = 100 figurinhas)
    const maxCampos = Math.min(chunks.length, 5);
    for (let i = 0; i < maxCampos; i++) {
      embed.addFields({
        name: chunks.length > 1 ? `Figurinhas (${i * 20 + 1}–${Math.min((i + 1) * 20, figurinhas.length)})` : "Lista",
        value: chunks[i]!,
        inline: false,
      });
    }

    if (chunks.length > 5) {
      embed.addFields({
        name: "...",
        value: `E mais ${figurinhas.length - 100} figurinhas`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao listar figurinhas");
    await interaction.editReply("❌ Erro ao listar as figurinhas. Tente novamente.");
  }
}
