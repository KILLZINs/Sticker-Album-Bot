import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable, colecaoUsuarioTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { verificarConquistas, anunciarConquistas } from "../lib/conquistas.js";
import { getSaldo, deductMoedas, getNivelRebirth, PACKS, NIVEL_NOME, calcularPreco, type TipoPacote } from "../lib/moedas.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";
import { refreshAttachmentUrls } from "../lib/refresh-attachments.js";

const RARIDADE_PESO: Record<string, number> = { comum: 55, incomum: 25, rara: 12, "épica": 6, "lendária": 2 };
const RARIDADE_CHANCE: Record<string, string> = { comum: "55%", incomum: "25%", rara: "12%", "épica": "6%", "lendária": "2%" };

interface PackSession {
  stickers: typeof catalogoFigurinhasTable.$inferSelect[];
  page: number;
  userId: string;
  username: string;
  packEmoji: string;
  packNome: string;
  novoSaldo: number;
  nomeMoeda: string;
  nivelNome: string;
  emojis: Awaited<ReturnType<typeof getGuildEmojis>>;
  expiresAt: number;
}

const sessions = new Map<string, PackSession>();

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(key);
  }
}

function buildPackEmbed(
  session: PackSession,
  sessionKey: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const { stickers, page, packEmoji, packNome, username, novoSaldo, nomeMoeda, nivelNome, emojis } = session;
  const fig = stickers[page]!;
  const total = stickers.length;
  const emoji = getRaridadeEmoji(emojis, fig.raridade);
  const chance = RARIDADE_CHANCE[fig.raridade] ?? "?";

  const isFirst = page === 0;
  const isLast = page === total - 1;

  const imageUrl = fig.imageUrl || null;

  const embed = new EmbedBuilder()
    .setTitle(`${packEmoji} ${packNome} de ${username}`)
    .setDescription(
      `${emoji} **${fig.titulo}**\n` +
      `Raridade: **${fig.raridade}** *(${chance})*`,
    )
    .setImage(imageUrl)
    .setColor(getRaridadeColor(fig.raridade))
    .addFields(
      { name: `${emojis.moedas} Saldo restante`, value: `${novoSaldo} ${nomeMoeda}`, inline: true },
      { name: "🏆 Nível do álbum", value: nivelNome, inline: true },
    )
    .setFooter({ text: `Figurinha ${page + 1} de ${total}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pacote_prev_${sessionKey}`)
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst),
    new ButtonBuilder()
      .setCustomId(`pacote_page_${sessionKey}`)
      .setLabel(`${page + 1} / ${total}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pacote_next_${sessionKey}`)
      .setLabel("▶ Próxima")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast),
    new ButtonBuilder()
      .setCustomId(`pacote_summary_${sessionKey}`)
      .setLabel("📋 Resumo")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, row };
}

function buildSummaryEmbed(
  session: PackSession,
  sessionKey: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const { stickers, packEmoji, packNome, username, novoSaldo, nomeMoeda, emojis } = session;

  const ordemRaridade = ["comum", "incomum", "rara", "épica", "lendária"];
  const counts: Record<string, number> = {};
  for (const s of stickers) counts[s.raridade] = (counts[s.raridade] ?? 0) + 1;

  const lista = stickers
    .map((s, i) => `\`${String(i + 1).padStart(2, "0")}.\` ${getRaridadeEmoji(emojis, s.raridade)} **${s.titulo}**`)
    .join("\n");

  const contagemStr = ordemRaridade
    .filter((r) => counts[r])
    .map((r) => `${getRaridadeEmoji(emojis, r)} ×${counts[r]}`)
    .join("  ·  ");

  const embed = new EmbedBuilder()
    .setTitle(`📋 Resumo — ${packEmoji} ${packNome} de ${username}`)
    .setDescription(lista)
    .setColor(0x5865f2)
    .addFields(
      { name: "Por raridade", value: contagemStr || "—", inline: false },
      { name: `${emojis.moedas} Saldo restante`, value: `${novoSaldo} ${nomeMoeda}`, inline: true },
    )
    .setFooter({ text: `${stickers.length} figurinha${stickers.length !== 1 ? "s" : ""} no total` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pacote_back_${sessionKey}`)
      .setLabel("◀ Ver figurinhas")
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, row };
}

export const data = new SlashCommandBuilder()
  .setName("abrir-pacote")
  .setDescription("Compra e abre um pacotinho de figurinhas com suas moedas!")
  .addStringOption((opt) =>
    opt.setName("tipo").setDescription("Tipo do pacotinho a comprar").setRequired(true)
      .addChoices(
        { name: "📦 Standard — 3 figurinhas", value: "standard" },
        { name: "🎁 Deluxe — 5 figurinhas", value: "deluxe" },
        { name: "⭐ Ultimate — 10 figurinhas", value: "ultimate" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const tipo = interaction.options.getString("tipo", true) as TipoPacote;

  try {
    const [emojis, moedaCfg] = await Promise.all([getGuildEmojis(guildId), getGuildMoedaConfig(guildId)]);
    const pack = PACKS[tipo];
    const nivel = await getNivelRebirth(guildId, userId);
    const precosBase: Record<TipoPacote, number> = { standard: moedaCfg.precoStandard, deluxe: moedaCfg.precoDeluxe, ultimate: moedaCfg.precoUltimate };
    const preco = calcularPreco(precosBase[tipo], nivel);
    const saldo = await getSaldo(guildId, userId);
    const nivelNome = NIVEL_NOME[nivel] ?? "Normal";
    const nomeMoeda = moedaCfg.nomeMoeda;
    const packEmojiMap: Record<TipoPacote, string> = { standard: emojis.pacote_standard, deluxe: emojis.pacote_deluxe, ultimate: emojis.pacote_ultimate };
    const packEmoji = packEmojiMap[tipo];

    if (saldo < preco) {
      const descPct = Math.round((1 - preco / precosBase[tipo]) * 100);
      const descTxt = descPct > 0 ? ` (${descPct}% desconto — ${nivelNome})` : "";
      await interaction.editReply(
        `❌ **Saldo insuficiente!**\n\n${emojis.moedas} Seu saldo: **${saldo} ${nomeMoeda}**\n${packEmoji} Pacote **${pack.nome}**: **${preco} ${nomeMoeda}**${descTxt}\n\nEnvie mensagens com mais de ${moedaCfg.comprimentoMinMensagem} caracteres para ganhar ${nomeMoeda}! **(+${moedaCfg.moedasPorMensagem} por mensagem)**`
      );
      return;
    }

    const catalogo = await db.select().from(catalogoFigurinhasTable).where(eq(catalogoFigurinhasTable.guildId, guildId));
    if (catalogo.length === 0) {
      await interaction.editReply("📭 O catálogo está vazio! Um admin precisa criar figurinhas com **/criar-figurinha** primeiro.");
      return;
    }

    await deductMoedas(guildId, userId, username, preco);
    const novoSaldo = await getSaldo(guildId, userId);
    const sorteadas = sortearComPeso(catalogo, pack.figurinhas);
    await db.insert(colecaoUsuarioTable).values(sorteadas.map((fig) => ({ guildId, userId, username, catalogoId: fig.id })));

    // Renova URLs expiradas da CDN do Discord antes de montar a sessão
    const refreshMap = await refreshAttachmentUrls(
      interaction.client,
      sorteadas.map((s) => s.imageUrl).filter(Boolean) as string[],
    );
    const stickers = refreshMap.size > 0
      ? sorteadas.map((s) => ({ ...s, imageUrl: refreshMap.get(s.imageUrl) ?? s.imageUrl }))
      : sorteadas;

    cleanExpiredSessions();

    // session key: "{userId}_{interactionId}" — unique per pack opening
    const sessionKey = `${userId}_${interaction.id}`;
    const session: PackSession = {
      stickers,
      page: 0,
      userId,
      username,
      packEmoji,
      packNome: pack.nome,
      novoSaldo,
      nomeMoeda,
      nivelNome,
      emojis,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    sessions.set(sessionKey, session);

    const { embed, row } = buildPackEmbed(session, sessionKey);
    await interaction.editReply({ embeds: [embed], components: [row] });

    const novas = await verificarConquistas(guildId, userId, username, {
      abreuPacote: true,
      figurinhasNovas: sorteadas.map((f) => ({ raridade: f.raridade })),
    });
    await anunciarConquistas(interaction.channelId, userId, novas, interaction.client, guildId);
  } catch (err) {
    logger.error({ err }, "Erro ao abrir pacote");
    await interaction.editReply("❌ Erro ao abrir o pacotinho. Tente novamente.");
  }
}

export async function handlePackNavigation(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  const isNext    = customId.startsWith("pacote_next_");
  const isPrev    = customId.startsWith("pacote_prev_");
  const isSummary = customId.startsWith("pacote_summary_");
  const isBack    = customId.startsWith("pacote_back_");

  if (!isNext && !isPrev && !isSummary && !isBack) return;

  const prefix = isNext ? "pacote_next_" : isPrev ? "pacote_prev_" : isSummary ? "pacote_summary_" : "pacote_back_";
  const sessionKey = customId.slice(prefix.length);

  const session = sessions.get(sessionKey);
  if (!session) {
    await interaction.reply({ content: "⏰ Esta sessão expirou. Use **/abrir-pacote** para abrir um novo pacote!", ephemeral: true });
    return;
  }

  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "❌ Só quem abriu o pacote pode navegar pelas figurinhas!", ephemeral: true });
    return;
  }

  if (isSummary) {
    const { embed, row } = buildSummaryEmbed(session, sessionKey);
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (isBack) {
    const { embed, row } = buildPackEmbed(session, sessionKey);
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  const newPage = isNext ? session.page + 1 : session.page - 1;
  session.page = Math.max(0, Math.min(newPage, session.stickers.length - 1));
  session.expiresAt = Date.now() + 10 * 60 * 1000;

  const { embed, row } = buildPackEmbed(session, sessionKey);
  await interaction.update({ embeds: [embed], components: [row] });
}

function sortearComPeso(figurinhas: typeof catalogoFigurinhasTable.$inferSelect[], quantidade: number): typeof catalogoFigurinhasTable.$inferSelect[] {
  if (figurinhas.length === 0) return [];
  const resultado: typeof catalogoFigurinhasTable.$inferSelect[] = [];
  for (let i = 0; i < quantidade; i++) {
    const pesoTotal = figurinhas.reduce((sum, fig) => sum + (RARIDADE_PESO[fig.raridade] ?? 55), 0);
    let rand = Math.random() * pesoTotal;
    let escolhida = figurinhas[0]!;
    for (const fig of figurinhas) { rand -= RARIDADE_PESO[fig.raridade] ?? 55; if (rand <= 0) { escolhida = fig; break; } }
    resultado.push(escolhida);
  }
  return resultado;
}

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x470f78;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}
