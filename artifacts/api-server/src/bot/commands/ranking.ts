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
import { colecaoUsuarioTable, catalogoFigurinhasTable, moedasUsuarioTable } from "@workspace/db";
import { eq, desc, count, countDistinct, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRankingMedal } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

const POR_PAGINA = 10;

export const data = new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Ranking completo dos colecionadores do servidor");

data.addStringOption((opt) =>
  opt
    .setName("filtro")
    .setDescription("Ordenar por figurinhas únicas ou por moedas")
    .setRequired(false)
    .addChoices(
      { name: "🎴 Figurinhas únicas (padrão)", value: "figurinhas" },
      { name: "🪙 Moedas", value: "moedas" },
    )
);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const filtro = (interaction.options.getString("filtro") ?? "figurinhas") as "figurinhas" | "moedas";

  try {
    const [emojis, moedaCfg, totalCatResult] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
      db.select({ total: count() }).from(catalogoFigurinhasTable).where(eq(catalogoFigurinhasTable.guildId, guildId)),
    ]);

    const totalCatalogo = totalCatResult[0]?.total ?? 0;
    const nomeMoeda = moedaCfg.nomeMoeda;

    let todos: { userId: string; username: string; valor: number }[] = [];

    if (filtro === "figurinhas") {
      const rows = await db
        .select({
          userId: colecaoUsuarioTable.userId,
          username: colecaoUsuarioTable.username,
          valor: countDistinct(colecaoUsuarioTable.catalogoId),
        })
        .from(colecaoUsuarioTable)
        .where(eq(colecaoUsuarioTable.guildId, guildId))
        .groupBy(colecaoUsuarioTable.userId, colecaoUsuarioTable.username)
        .orderBy(desc(countDistinct(colecaoUsuarioTable.catalogoId)));
      todos = rows.map((r) => ({ ...r, valor: r.valor }));
    } else {
      const rows = await db
        .select({ userId: moedasUsuarioTable.userId, username: moedasUsuarioTable.username, valor: moedasUsuarioTable.saldo })
        .from(moedasUsuarioTable)
        .where(eq(moedasUsuarioTable.guildId, guildId))
        .orderBy(desc(moedasUsuarioTable.saldo));
      todos = rows;
    }

    if (todos.length === 0) {
      await interaction.editReply("📭 Ninguém aparece no ranking ainda!\n\nAbra um pacote com **/abrir-pacote** para começar.");
      return;
    }

    const totalPaginas = Math.ceil(todos.length / POR_PAGINA);
    let pagina = 0;
    const meuIdx = todos.findIndex((e) => e.userId === interaction.user.id);

    const buildEmbed = (pag: number) => {
      const inicio = pag * POR_PAGINA;
      const slice = todos.slice(inicio, inicio + POR_PAGINA);

      const linhas = slice.map((entry, i) => {
        const pos = inicio + i;
        const medalha = getRankingMedal(emojis, pos);
        const voce = entry.userId === interaction.user.id ? " 👈 **você**" : "";
        if (filtro === "figurinhas") {
          const pct = totalCatalogo > 0 ? Math.round((entry.valor / totalCatalogo) * 100) : 0;
          return `${medalha} <@${entry.userId}> — **${entry.valor}**/${totalCatalogo} (${pct}%)${voce}`;
        } else {
          return `${medalha} <@${entry.userId}> — **${entry.valor}** ${nomeMoeda}${voce}`;
        }
      });

      let rodape = "";
      if (meuIdx >= 0 && (meuIdx < inicio || meuIdx >= inicio + POR_PAGINA)) {
        const meu = todos[meuIdx]!;
        if (filtro === "figurinhas") {
          const pct = totalCatalogo > 0 ? Math.round((meu.valor / totalCatalogo) * 100) : 0;
          rodape = `\n\n📍 Sua posição: **${meuIdx + 1}º** — ${meu.valor}/${totalCatalogo} (${pct}%)`;
        } else {
          rodape = `\n\n📍 Sua posição: **${meuIdx + 1}º** — ${meu.valor} ${nomeMoeda}`;
        }
      }

      const titulo = filtro === "figurinhas"
        ? `🏆 Ranking — Figurinhas Únicas`
        : `${emojis.moedas} Ranking — ${nomeMoeda.charAt(0).toUpperCase() + nomeMoeda.slice(1)}`;

      return new EmbedBuilder()
        .setTitle(titulo)
        .setColor(0x7B2FBE)
        .setDescription(linhas.join("\n") + rodape)
        .setFooter({
          text: `Página ${pag + 1}/${totalPaginas} • ${todos.length} jogadores${filtro === "figurinhas" ? ` • Catálogo: ${totalCatalogo} figurinhas` : ""}`,
        })
        .setTimestamp();
    };

    const buildRow = (pag: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("rank_prev").setLabel("◀ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId("rank_first").setLabel("⏮ Início").setStyle(ButtonStyle.Secondary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId("rank_me").setLabel("📍 Minha posição").setStyle(ButtonStyle.Primary).setDisabled(meuIdx < 0),
        new ButtonBuilder().setCustomId("rank_last").setLabel("⏭ Fim").setStyle(ButtonStyle.Secondary).setDisabled(pag === totalPaginas - 1),
        new ButtonBuilder().setCustomId("rank_next").setLabel("Próxima ▶").setStyle(ButtonStyle.Secondary).setDisabled(pag === totalPaginas - 1),
      );

    const msg = await interaction.editReply({ embeds: [buildEmbed(pagina)], components: totalPaginas > 1 ? [buildRow(pagina)] : [] });
    if (totalPaginas <= 1) return;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000, filter: (i) => i.user.id === interaction.user.id });
    collector.on("collect", async (i) => {
      if (i.customId === "rank_prev" && pagina > 0) pagina--;
      else if (i.customId === "rank_next" && pagina < totalPaginas - 1) pagina++;
      else if (i.customId === "rank_first") pagina = 0;
      else if (i.customId === "rank_last") pagina = totalPaginas - 1;
      else if (i.customId === "rank_me" && meuIdx >= 0) pagina = Math.floor(meuIdx / POR_PAGINA);
      await i.update({ embeds: [buildEmbed(pagina)], components: [buildRow(pagina)] });
    });
    collector.on("end", async () => { await interaction.editReply({ components: [] }).catch(() => {}); });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar ranking");
    await interaction.editReply("❌ Erro ao buscar o ranking. Tente novamente.");
  }
}
