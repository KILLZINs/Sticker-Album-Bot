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
import { eq, and, ilike, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

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
  const isSelf = alvoUser.id === interaction.user.id;

  try {
    const [emojis, totalCatResult] = await Promise.all([
      getGuildEmojis(guildId),
      db.select({ total: countDistinct(catalogoFigurinhasTable.id) })
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId)),
    ]);
    const totalCatalogo = totalCatResult[0]?.total ?? 0;

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
      .where(whereClause)
      .orderBy(catalogoFigurinhasTable.numero);

    if (figurinhas.length === 0) {
      if (busca) {
        await interaction.editReply(
          `🔍 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha com **"${busca}"** no álbum.\n\nRemova o filtro para ver o álbum completo.`
        );
      } else {
        await interaction.editReply(
          `📭 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha ainda!\n\nUse **/abrir-pacote** para ganhar figurinhas.`
        );
      }
      return;
    }

    // Deduplica para álbum de únicas
    const seen = new Set<number>();
    const unicas = figurinhas.filter((f) => {
      if (seen.has(f.catalogoId)) return false;
      seen.add(f.catalogoId);
      return true;
    });

    const totalPages = unicas.length;
    let page = 0;

    const pct = totalCatalogo > 0 ? Math.round((unicas.length / totalCatalogo) * 100) : 0;

    const buildEmbed = (idx: number) => {
      const fig = unicas[idx]!;
      const emoji = getRaridadeEmoji(emojis, fig.raridade);
      const raridadeTitle = fig.raridade.charAt(0).toUpperCase() + fig.raridade.slice(1);
      const desbloqueado = fig.desbloqueadoEm.toLocaleDateString("pt-BR");

      return new EmbedBuilder()
        .setTitle(`📖 Álbum de ${alvoUser.username}${busca ? ` · Busca: "${busca}"` : ""}`)
        .setDescription(
          `${emoji} **${fig.titulo}**\n` +
          `┣ Raridade: **${raridadeTitle}**\n` +
          `┣ Catálogo: **#${fig.numero}**\n` +
          `┗ Desbloqueada em **${desbloqueado}**\n\n` +
          (fig.descricao ? `*${fig.descricao}*` : "*Sem descrição*"),
        )
        .setImage(fig.imageUrl)
        .setColor(getRaridadeColor(fig.raridade))
        .setThumbnail(alvoUser.displayAvatarURL())
        .setFooter({ text: `${unicas.length}/${totalCatalogo} únicas (${pct}%) · Figurinha ${idx + 1} de ${unicas.length}` })
        .setTimestamp();
    };

    const buildRow = (idx: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("alb_prev")
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === 0),
        new ButtonBuilder()
          .setCustomId("alb_page")
          .setLabel(`${idx + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("alb_next")
          .setLabel("▶ Próxima")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === totalPages - 1),
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
      if (i.customId === "alb_prev" && page > 0) page--;
      if (i.customId === "alb_next" && page < totalPages - 1) page++;
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
    case "incomum": return 0x2ecc71;
    case "rara": return 0x3498db;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf39c12;
    default: return 0x95a5a6;
  }
}
