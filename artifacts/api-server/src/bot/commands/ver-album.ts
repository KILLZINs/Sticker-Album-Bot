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
import { getGuildEmojis, getRaridadeEmoji, type GuildEmojis } from "../lib/emoji-config.js";
import { refreshAttachmentUrls, applyRefresh } from "../lib/refresh-attachments.js";

export const data = new SlashCommandBuilder()
  .setName("ver-album")
  .setDescription("Navega pelo seu álbum de figurinhas únicas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver o álbum de outro usuário").setRequired(false)
  )
  .addStringOption((opt) =>
    opt.setName("busca").setDescription("Filtrar figurinhas pelo nome").setRequired(false).setMaxLength(50)
  );

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const busca = interaction.options.getString("busca");
  const guildId = interaction.guildId!;
  const userId = alvoUser.id;
  const isSelf = alvoUser.id === interaction.user.id;

  try {
    const [emojis, todas] = await Promise.all([
      getGuildEmojis(guildId),
      db
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
        .innerJoin(catalogoFigurinhasTable, eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id))
        .where(
          busca
            ? and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId), ilike(catalogoFigurinhasTable.titulo, `%${busca}%`))
            : and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId))
        )
        .orderBy(catalogoFigurinhasTable.numero),
    ]);

    // Deduplica por catalogoId — álbum mostra só figurinhas únicas + conta cópias
    type FigRow = typeof todas[number];
    const uniqueMap = new Map<number, { fig: FigRow; copias: number; primeiraEm: Date }>();
    for (const fig of todas) {
      const ex = uniqueMap.get(fig.catalogoId);
      if (!ex) {
        uniqueMap.set(fig.catalogoId, { fig, copias: 1, primeiraEm: fig.desbloqueadoEm });
      } else {
        ex.copias++;
        if (fig.desbloqueadoEm < ex.primeiraEm) ex.primeiraEm = fig.desbloqueadoEm;
      }
    }

    let figurinhas = Array.from(uniqueMap.values());

    // Renova URLs expiradas da CDN do Discord automaticamente
    const allImageUrls = figurinhas.map((f) => f.fig.imageUrl).filter(Boolean) as string[];
    const refreshMap = await refreshAttachmentUrls(interaction.client, allImageUrls);
    if (refreshMap.size > 0) {
      figurinhas = figurinhas.map((entry) => ({
        ...entry,
        fig: { ...entry.fig, imageUrl: applyRefresh(entry.fig.imageUrl, refreshMap) },
      }));
    }

    if (figurinhas.length === 0) {
      await interaction.editReply(
        busca
          ? `🔍 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha com **"${busca}"** no álbum.`
          : `📭 ${isSelf ? "Você não tem" : `<@${userId}> não tem`} nenhuma figurinha ainda!\n\nUse **/abrir-pacote** para começar.`
      );
      return;
    }

    const totalPages = figurinhas.length;
    const totalCopias = todas.length;
    let page = 0;

    const buildEmbed = (idx: number, guildEmojis: GuildEmojis) => {
      const { fig, copias, primeiraEm } = figurinhas[idx]!;
      const rarEmoji = getRaridadeEmoji(guildEmojis, fig.raridade);
      const raridadeNome = fig.raridade.charAt(0).toUpperCase() + fig.raridade.slice(1);
      const copiasTexto = copias > 1 ? `📋 **${copias}x** *(${copias - 1} repetida${copias - 1 !== 1 ? "s" : ""})*` : "1 cópia";

      return new EmbedBuilder()
        .setTitle(`${rarEmoji} #${fig.numero} — ${fig.titulo}`)
        .setDescription(fig.descricao ? `*${fig.descricao}*` : "")
        .setImage(fig.imageUrl)
        .setColor(getRaridadeColor(fig.raridade))
        .addFields(
          { name: "✨ Raridade", value: `${rarEmoji} ${raridadeNome}`, inline: true },
          { name: "📋 Cópias", value: copiasTexto, inline: true },
          { name: "🗂️ Catálogo", value: `#${fig.numero}`, inline: true },
        )
        .setAuthor({ name: `📖 Álbum de ${alvoUser.username}${busca ? ` — "${busca}"` : ""}`, iconURL: alvoUser.displayAvatarURL() })
        .setFooter({ text: `Figurinha ${idx + 1} de ${totalPages} únicas • ${totalCopias} total${busca ? " (filtrado)" : ""} • Desbloqueada` })
        .setTimestamp(primeiraEm);
    };

    const buildRow = (idx: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ver_prev").setLabel("◀ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
        new ButtonBuilder().setCustomId("ver_info").setLabel(`${idx + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("ver_next").setLabel("Próxima ▶").setStyle(ButtonStyle.Primary).setDisabled(idx === totalPages - 1),
      );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(page, emojis)],
      components: totalPages > 1 ? [buildRow(page)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "❌ Apenas quem usou o comando pode navegar pelo álbum.", ephemeral: true });
        return;
      }
      if (i.customId === "ver_prev" && page > 0) page--;
      if (i.customId === "ver_next" && page < totalPages - 1) page++;
      await i.update({ embeds: [buildEmbed(page, emojis)], components: [buildRow(page)] });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (err) {
    logger.error({ err }, "Erro ao ver álbum");
    await interaction.editReply("❌ Erro ao buscar o álbum. Tente novamente.");
  }
}
