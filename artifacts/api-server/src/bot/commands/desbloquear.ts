import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable, colecaoUsuarioTable } from "@workspace/db";
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
  .setName("desbloquear-figurinha")
  .setDescription("Desbloqueia uma figurinha do catálogo para o seu álbum")
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo (veja com /catalogo)")
      .setRequired(false)
      .setMinValue(1)
  )
  .addStringOption((opt) =>
    opt
      .setName("busca")
      .setDescription("Buscar figurinha pelo nome")
      .setRequired(false)
      .setMaxLength(50)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const numero = interaction.options.getInteger("numero");
  const busca = interaction.options.getString("busca");
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (!numero && !busca) {
    await interaction.editReply(
      "❌ Informe o **número** ou o **nome** da figurinha!\nUse **/catalogo** para ver todas as figurinhas disponíveis."
    );
    return;
  }

  try {
    // Buscar figurinha no catálogo
    let figurinha = null;

    if (numero) {
      const [found] = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(
          and(
            eq(catalogoFigurinhasTable.guildId, guildId),
            eq(catalogoFigurinhasTable.numero, numero)
          )
        )
        .limit(1);
      figurinha = found ?? null;
    } else if (busca) {
      const results = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(
          and(
            eq(catalogoFigurinhasTable.guildId, guildId),
            ilike(catalogoFigurinhasTable.titulo, `%${busca}%`)
          )
        )
        .limit(5);

      if (results.length === 0) {
        await interaction.editReply(`🔍 Nenhuma figurinha encontrada com o nome **"${busca}"**.\nUse **/catalogo** para ver todas.`);
        return;
      }

      if (results.length === 1) {
        figurinha = results[0]!;
      } else {
        // Múltiplos resultados — mostrar lista para escolher
        const lista = results
          .map((f) => `${RARIDADE_EMOJI[f.raridade] ?? "⚪"} **#${f.numero}** ${f.titulo}`)
          .join("\n");
        await interaction.editReply(
          `🔍 Encontrei **${results.length}** figurinhas com "${busca}":\n\n${lista}\n\nUse **/desbloquear-figurinha numero:<número>** para escolher uma específica.`
        );
        return;
      }
    }

    if (!figurinha) {
      await interaction.editReply(
        `❌ Figurinha ${numero ? `#${numero}` : `"${busca}"`} não encontrada no catálogo!\nUse **/catalogo** para ver todas.`
      );
      return;
    }

    // Verificar se o usuário já tem esta figurinha
    const [jaTemFigurinha] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId),
          eq(colecaoUsuarioTable.catalogoId, figurinha.id)
        )
      )
      .limit(1);

    if (jaTemFigurinha) {
      const emoji = RARIDADE_EMOJI[figurinha.raridade] ?? "⚪";
      await interaction.editReply(
        `⚠️ Você já tem a figurinha **${emoji} ${figurinha.titulo}** no seu álbum!`
      );
      return;
    }

    // Desbloquear!
    await db.insert(colecaoUsuarioTable).values({
      guildId,
      userId,
      username,
      catalogoId: figurinha.id,
    });

    const emoji = RARIDADE_EMOJI[figurinha.raridade] ?? "⚪";

    const embed = new EmbedBuilder()
      .setTitle(`🎉 Figurinha desbloqueada!`)
      .setDescription(`<@${userId}> adicionou **${emoji} ${figurinha.titulo}** ao seu álbum!`)
      .setImage(figurinha.imageUrl)
      .setColor(getRaridadeColor(figurinha.raridade))
      .addFields(
        { name: "Título", value: figurinha.titulo, inline: true },
        { name: "Raridade", value: `${emoji} ${figurinha.raridade}`, inline: true },
        { name: "Nº no catálogo", value: `#${figurinha.numero}`, inline: true }
      )
      .setFooter({ text: `Coleção de ${username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err: any) {
    // Erro de constraint única (já tem a figurinha — race condition)
    if (err?.code === "23505") {
      await interaction.editReply("⚠️ Você já tem essa figurinha no álbum!");
      return;
    }
    logger.error({ err }, "Erro ao desbloquear figurinha");
    await interaction.editReply("❌ Erro ao desbloquear a figurinha. Tente novamente.");
  }
}

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}
