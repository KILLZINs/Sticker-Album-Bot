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
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";
import { isFigurinhaSecreta } from "../lib/figurinha-display.js";
import { refreshAttachmentUrls } from "../lib/refresh-attachments.js";

export const data = new SlashCommandBuilder()
  .setName("catalogo")
  .setDescription("Mostra todas as figurinhas disponíveis no servidor")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver progresso de outro usuário").setRequired(false)
  );

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x470f78;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;

  try {
    const [emojis, catalogo] = await Promise.all([
      getGuildEmojis(guildId),
      db
        .select()
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId))
        .orderBy(catalogoFigurinhasTable.numero),
    ]);

    if (catalogo.length === 0) {
      await interaction.editReply(
        "📭 **Catálogo vazio!**\n\nPeça para um administrador usar **/criar-figurinha** para adicionar figurinhas."
      );
      return;
    }

    const colecao = await db
      .select({ catalogoId: colecaoUsuarioTable.catalogoId })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, alvoUser.id)
        )
      );

    const desbloqueadosIds = new Set(colecao.map((c) => c.catalogoId));
    const totalDesbloqueadas = desbloqueadosIds.size;

    // Renova URLs expiradas da CDN do Discord antes de exibir
    const refreshMap = await refreshAttachmentUrls(
      interaction.client,
      catalogo.map((f) => f.imageUrl).filter(Boolean) as string[],
    );
    const figurinhas = refreshMap.size > 0
      ? catalogo.map((f) => ({ ...f, imageUrl: f.imageUrl ? (refreshMap.get(f.imageUrl) ?? f.imageUrl) : f.imageUrl }))
      : catalogo;

    const total = figurinhas.length;
    let page = 0;

    const buildEmbed = (p: number) => {
      const fig = figurinhas[p]!;
      const emojiRaridade = getRaridadeEmoji(emojis, fig.raridade);
      const desbloqueada = desbloqueadosIds.has(fig.id);
      const status = desbloqueada ? "✅ Coletada" : "⬜ Ainda não coletada";
      const progresso = Math.round((totalDesbloqueadas / total) * 100);

      const secreta = isFigurinhaSecreta(fig.titulo);

      const embed = new EmbedBuilder()
        .setTitle(`${emojiRaridade} #${fig.numero} — ${fig.titulo}`)
        .setDescription(
          `Raridade: **${fig.raridade}**\n` +
          `Status: ${status}\n\n` +
          `**Progresso de ${alvoUser.username}:** ${totalDesbloqueadas}/${total} (**${progresso}%**)` +
          (secreta ? `\n\n🔒 *Figurinha secreta — a imagem não é revelada.*` : "")
        )
        .setColor(getRaridadeColor(fig.raridade))
        .setFooter({ text: `📖 Catálogo — ${interaction.guild?.name ?? "Servidor"} · Figurinha ${p + 1} de ${total}` });

      if (fig.imageUrl && !secreta) embed.setImage(fig.imageUrl);

      return embed;
    };

    const buildRow = (p: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("cat_prev")
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId("cat_page")
          .setLabel(`${p + 1} / ${total}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("cat_next")
          .setLabel("Próxima ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === total - 1),
      );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(page)],
      components: total > 1 ? [buildRow(page)] : [],
    });

    if (total <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 180_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "cat_prev" && page > 0) page--;
      if (i.customId === "cat_next" && page < total - 1) page++;
      await i.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (err) {
    logger.error({ err }, "Erro ao mostrar catálogo");
    await interaction.editReply("❌ Erro ao carregar o catálogo. Tente novamente.");
  }
}
