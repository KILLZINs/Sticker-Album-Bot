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

export const data = new SlashCommandBuilder()
  .setName("catalogo")
  .setDescription("Mostra todas as figurinhas disponíveis no servidor")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver progresso de outro usuário").setRequired(false)
  );

const PAGE_SIZE = 10;

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

    const totalPages = Math.ceil(catalogo.length / PAGE_SIZE);
    let page = 0;

    const buildEmbed = (p: number) => {
      const inicio = p * PAGE_SIZE;
      const pagina = catalogo.slice(inicio, inicio + PAGE_SIZE);

      const linhas = pagina.map((fig) => {
        const emoji = getRaridadeEmoji(emojis, fig.raridade);
        const status = desbloqueadosIds.has(fig.id) ? "✅" : "⬜";
        return `${status} ${emoji} **#${fig.numero}** — ${fig.titulo}`;
      });

      const progresso = Math.round((totalDesbloqueadas / catalogo.length) * 100);
      const barraLen = 18;
      const preenchido = Math.round((progresso / 100) * barraLen);
      const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);

      return new EmbedBuilder()
        .setTitle(`📖 Catálogo — ${interaction.guild?.name ?? "Servidor"}`)
        .setDescription(
          `**Progresso de ${alvoUser.username}:**\n` +
          `\`${barra}\` ${totalDesbloqueadas}/${catalogo.length} (**${progresso}%**)\n\n` +
          linhas.join("\n"),
        )
        .setColor(0x470f78)
        .setThumbnail(alvoUser.displayAvatarURL())
        .setFooter({
          text: `Página ${p + 1} de ${totalPages} · ✅ coletada · ⬜ faltando`,
        });
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
          .setLabel(`${p + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("cat_next")
          .setLabel("Próxima ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === totalPages - 1),
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
      if (i.customId === "cat_prev" && page > 0) page--;
      if (i.customId === "cat_next" && page < totalPages - 1) page++;
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
