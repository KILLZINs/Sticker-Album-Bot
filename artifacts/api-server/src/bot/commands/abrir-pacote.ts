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
import { getSaldo, deductMoedas, getNivelRebirth, PACKS, calcularPreco, type TipoPacote } from "../lib/moedas.js";
import { getGuildEmojis, getRaridadeEmoji, getNivelDisplay } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";
import { refreshAttachmentUrls } from "../lib/refresh-attachments.js";

const RARIDADE_PESO: Record<string, number> = { comum: 55, incomum: 25, rara: 12, "épica": 6, "lendária": 2 };
const RARIDADE_CHANCE: Record<string, string> = { comum: "55%", incomum: "25%", rara: "12%", "épica": "6%", "lendária": "2%" };
const RARIDADE_ORDEM = ["lendária", "épica", "rara", "incomum", "comum"];

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

  const hype: Record<string, string> = {
    lendária: "🌟 **LENDÁRIA! SORTE INCRÍVEL!** 🌟",
    épica: "🟣 **ÉPICA! Que figurinha rara!** 🟣",
    rara: "💙 **RARA! Boa sorte!**",
  };
  const hypeMsg = hype[fig.raridade];
  const raridadeTitle = fig.raridade.charAt(0).toUpperCase() + fig.raridade.slice(1);

  const embed = new EmbedBuilder()
    .setTitle(`${packEmoji} ${packNome}`)
    .setDescription(
      (hypeMsg ? `${hypeMsg}\n\n` : "") +
      `${emoji} **${fig.titulo}**\n` +
      `┣ Raridade: **${raridadeTitle}** *(${chance} de chance)*\n` +
      `┗ Catálogo: **#${fig.numero}**`,
    )
    .setImage(fig.imageUrl || null)
    .setColor(getRaridadeColor(fig.raridade))
    .addFields(
      { name: `${emojis.moedas} Saldo restante`, value: `**${novoSaldo}** ${nomeMoeda}`, inline: true },
      { name: "🏆 Nível", value: nivelNome, inline: true },
    )
    .setFooter({ text: `${username} · Figurinha ${page + 1} de ${total} · 📋 Resumo para ver tudo` })
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
      .setCustomId(`pacote_resumo_${sessionKey}`)
      .setLabel("📋 Resumo")
      .setStyle(ButtonStyle.Success),
  );

  return { embed, row };
}

function buildResumoEmbed(
  session: PackSession,
  sessionKey: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const { stickers, packEmoji, packNome, username, novoSaldo, nomeMoeda, nivelNome, emojis } = session;

  // Ordenar por raridade (mais impressionante primeiro)
  const sorted = [...stickers].sort(
    (a, b) => RARIDADE_ORDEM.indexOf(a.raridade) - RARIDADE_ORDEM.indexOf(b.raridade),
  );

  const linhas = sorted.map((fig) => {
    const e = getRaridadeEmoji(emojis, fig.raridade);
    const originalIdx = stickers.indexOf(fig) + 1;
    return `${e} **${fig.titulo}** — *#${fig.numero}* *(posição ${originalIdx})*`;
  });

  const contagem: Record<string, number> = {};
  for (const fig of stickers) {
    contagem[fig.raridade] = (contagem[fig.raridade] ?? 0) + 1;
  }
  const contagemTexto = RARIDADE_ORDEM
    .filter((r) => contagem[r])
    .map((r) => `${getRaridadeEmoji(emojis, r)} ${r}: **${contagem[r]}**`)
    .join("  ·  ");

  const embed = new EmbedBuilder()
    .setTitle(`${packEmoji} Resumo — ${packNome} de ${username}`)
    .setDescription(linhas.join("\n"))
    .setColor(0x5865f2)
    .addFields(
      { name: "📊 Distribuição por raridade", value: contagemTexto || "—", inline: false },
      { name: `${emojis.moedas} Saldo restante`, value: `**${novoSaldo}** ${nomeMoeda}`, inline: true },
      { name: "🏆 Nível", value: nivelNome, inline: true },
    )
    .setFooter({ text: `${stickers.length} figurinha${stickers.length > 1 ? "s" : ""} · Ordenadas por raridade` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pacote_prev_${sessionKey}`)
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pacote_page_${sessionKey}`)
      .setLabel(`— / ${stickers.length}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pacote_next_${sessionKey}`)
      .setLabel("▶ Próxima")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pacote_resumo_${sessionKey}`)
      .setLabel("📋 Resumo")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
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
    const nivelNome = getNivelDisplay(emojis, nivel);
    const nomeMoeda = moedaCfg.nomeMoeda;
    const packEmojiMap: Record<TipoPacote, string> = { standard: emojis.pacote_standard, deluxe: emojis.pacote_deluxe, ultimate: emojis.pacote_ultimate };
    const packEmoji = packEmojiMap[tipo];

    if (saldo < preco) {
      const descPct = Math.round((1 - preco / precosBase[tipo]) * 100);
      const descTxt = descPct > 0 ? ` *(${descPct}% desconto — ${nivelNome})*` : "";
      await interaction.editReply(
        `❌ **Saldo insuficiente!**\n\n` +
        `${emojis.moedas} Seu saldo: **${saldo} ${nomeMoeda}**\n` +
        `${packEmoji} Pacote **${pack.nome}**: **${preco} ${nomeMoeda}**${descTxt}\n\n` +
        `Envie mensagens com mais de ${moedaCfg.comprimentoMinMensagem} caracteres para ganhar ${nomeMoeda}! **(+${moedaCfg.moedasPorMensagem} por mensagem)**`
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

    const refreshMap = await refreshAttachmentUrls(
      interaction.client,
      sorteadas.map((s) => s.imageUrl).filter(Boolean) as string[],
    );
    const stickers = refreshMap.size > 0
      ? sorteadas.map((s) => ({ ...s, imageUrl: refreshMap.get(s.imageUrl) ?? s.imageUrl }))
      : sorteadas;

    cleanExpiredSessions();

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
  const isNext = customId.startsWith("pacote_next_");
  const isPrev = customId.startsWith("pacote_prev_");
  const isResumo = customId.startsWith("pacote_resumo_");

  if (!isNext && !isPrev && !isResumo) return;

  const sessionKey = isNext
    ? customId.slice("pacote_next_".length)
    : isPrev
      ? customId.slice("pacote_prev_".length)
      : customId.slice("pacote_resumo_".length);

  const session = sessions.get(sessionKey);
  if (!session) {
    await interaction.reply({ content: "⏰ Sessão expirada! Use **/abrir-pacote** para abrir um novo pacote.", ephemeral: true });
    return;
  }

  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "❌ Só quem abriu o pacote pode navegar pelas figurinhas!", ephemeral: true });
    return;
  }

  session.expiresAt = Date.now() + 10 * 60 * 1000;

  if (isResumo) {
    const { embed, row } = buildResumoEmbed(session, sessionKey);
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  const newPage = isNext ? session.page + 1 : session.page - 1;
  session.page = Math.max(0, Math.min(newPage, session.stickers.length - 1));

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
    case "incomum": return 0x2ecc71;
    case "rara": return 0x3498db;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf39c12;
    default: return 0x95a5a6;
  }
}
