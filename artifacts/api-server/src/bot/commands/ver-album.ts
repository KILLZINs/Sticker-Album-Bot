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
  .setName("ver-album")
  .setDescription("Navega pelo seu álbum de figurinhas desbloqueadas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver o álbum de outro usuário").setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName("busca")
      .setDescription("Filtrar figurinhas pelo nome")
      .setRequired(false)
      .setMaxLength(50)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const busca = interaction.options.getString("busca");
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;

  try {
    // Buscar coleção do usuário com dados do catálogo
    let colecaoQuery = db
      .select({
        colecaoId: colecaoUsuarioTable.id,
        desbloqueadoEm: colecaoUsuarioTable.desbloqueadoEm,
        catalogoId: catalogoFigurinhasTable.id,
        numero: catalogoFigurinhasTable.numero,
        titulo: catalogoFigurinhasTable.titulo,
        descricao: catalogoFigurinhasTable.descricao,
        raridade: catalogoFigurinhasTable.raridade,
        imageUrl: catalogoFigurinhasTable.imageUrl,
      })
      .from(colecaoUsuarioTable)
      .innerJoin(
        catalogoFigurinhasTable,
        eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id)
      )
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, userId),
          ...(busca ? [ilike(catalogoFigurinhasTable.titulo, `%${busca}%`)] : [])
        )
      )
      .orderBy(catalogoFigurinhasTable.numero);

    const figurinhas = await colecaoQuery;

    const isSelf = alvoUser.id === interaction.user.id;

    if (figurinhas.length === 0) {
      if (busca) {
        await interaction.editReply(
          `🔍 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha com **"${busca}"** no álbum.\n\nRemova o filtro para ver o álbum completo.`
        );
      } else {
        await interaction.editReply(
          `📭 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha ainda!\n\nUse **/desbloquear-figurinha** para começar sua coleção.`
        );
      }
      return;
    }

    const totalPages = figurinhas.length;
    let page = 0;

    const buildEmbed = (idx: number) => {
      const fig = figurinhas[idx]!;
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";

      return new EmbedBuilder()
        .setTitle(
          `📖 Álbum de ${alvoUser.username}${busca ? ` — busca: "${busca}"` : ""}`
        )
        .setDescription(fig.descricao ?? "Sem descrição")
        .setImage(fig.imageUrl)
        .setColor(getRaridadeColor(fig.raridade))
        .addFields(
          { name: "Título", value: fig.titulo, inline: true },
          {
            name: "Raridade",
            value: `${emoji} ${fig.raridade.charAt(0).toUpperCase() + fig.raridade.slice(1)}`,
            inline: true,
          },
          { name: "Nº no catálogo", value: `#${fig.numero}`, inline: true }
        )
        .setFooter({
          text: `Figurinha ${idx + 1} de ${totalPages} • Desbloqueada em`,
        })
        .setTimestamp(fig.desbloqueadoEm);
    };

    const buildRow = (idx: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === 0),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("Próxima ▶")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(idx === totalPages - 1)
      );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(page)],
      components: totalPages > 1 ? [buildRow(page)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "prev" && page > 0) page--;
      if (i.customId === "next" && page < totalPages - 1) page++;
      await i.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (err) {
    logger.error({ err }, "Erro ao ver álbum");
    await interaction.editReply("❌ Erro ao buscar o álbum. Tente novamente.");
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
