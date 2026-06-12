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

const RARIDADE_ORDEM: Record<string, number> = {
  "lendária": 1,
  "épica":    2,
  "rara":     3,
  "incomum":  4,
  "comum":    5,
};

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName("catalogo")
  .setDescription("Mostra todas as figurinhas disponíveis no servidor")
  .addStringOption((opt) =>
    opt
      .setName("ordenar")
      .setDescription("Ordem de exibição (padrão: número)")
      .setRequired(false)
      .addChoices(
        { name: "🔢 Número (padrão)", value: "numero" },
        { name: "⭐ Raridade (lendária primeiro)", value: "raridade" },
        { name: "🔤 Alfabeto (A → Z)", value: "alfabeto" },
      )
  )
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver progresso de outro usuário").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const ordenar = (interaction.options.getString("ordenar") ?? "numero") as "numero" | "raridade" | "alfabeto";
  const guildId = interaction.guildId!;

  try {
    const emojis = await getGuildEmojis(guildId);

    const catalogoBruto = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    if (catalogoBruto.length === 0) {
      await interaction.editReply(
        "📭 Nenhuma figurinha no catálogo ainda!\n\n" +
          "Peça para um administrador usar **/criar-figurinha** para adicionar figurinhas."
      );
      return;
    }

    // Ordenar conforme a opção escolhida
    const catalogo = [...catalogoBruto].sort((a, b) => {
      if (ordenar === "raridade") {
        const diff = (RARIDADE_ORDEM[a.raridade] ?? 9) - (RARIDADE_ORDEM[b.raridade] ?? 9);
        return diff !== 0 ? diff : a.numero - b.numero;
      }
      if (ordenar === "alfabeto") {
        return a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" });
      }
      // numero (padrão)
      return a.numero - b.numero;
    });

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

    const ordemLabel: Record<string, string> = {
      numero:   "🔢 por número",
      raridade: "⭐ por raridade",
      alfabeto: "🔤 alfabética",
    };

    const buildEmbed = (p: number) => {
      const inicio = p * PAGE_SIZE;
      const pagina = catalogo.slice(inicio, inicio + PAGE_SIZE);

      const linhas = pagina.map((fig) => {
        const emoji = getRaridadeEmoji(emojis, fig.raridade);
        const status = desbloqueadosIds.has(fig.id) ? "✅" : "🔒";
        return `${status} ${emoji} **#${fig.numero}** ${fig.titulo}`;
      });

      const progresso = Math.round((totalDesbloqueadas / catalogo.length) * 100);
      const barraLen = 20;
      const preenchido = Math.round((progresso / 100) * barraLen);
      const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);

      return new EmbedBuilder()
        .setTitle(`📖 Catálogo de Figurinhas`)
        .setDescription(
          `**Progresso de ${alvoUser.username}:** ${totalDesbloqueadas}/${catalogo.length} (${progresso}%)\n\`${barra}\`\n\n` +
            linhas.join("\n")
        )
        .setColor(0x470f78)
        .setThumbnail(alvoUser.displayAvatarURL())
        .setFooter({
          text: `Página ${p + 1}/${totalPages} • Ordem ${ordemLabel[ordenar]} • ✅ desbloqueada • 🔒 bloqueada`,
        });
    };

    const buildRow = (p: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("Próxima ▶")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(p === totalPages - 1)
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
    logger.error({ err }, "Erro ao mostrar catálogo");
    await interaction.editReply("❌ Erro ao carregar o catálogo. Tente novamente.");
  }
}
