import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { bolaoTable, palpitesBolaoTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";
import { isAdmin, ADMIN_DENY_MSG } from "./admin-check.js";

// Cores do tema roxo
const COR_ATIVO     = 0x9B59B6; // roxo vibrante
const COR_AGUARDANDO = 0x6C3483; // roxo escuro
const COR_ENCERRADO  = 0x7D3C98; // roxo médio

const timersAtivos = new Map<number, ReturnType<typeof setTimeout>>();

export function unixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function apostasAbertas(bolao: { encerraEm: Date; encerrado: boolean }): boolean {
  return !bolao.encerrado && bolao.encerraEm > new Date();
}

export async function gerarEmbedBolao(bolaoId: number) {
  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao) return null;

  const palpites = await db
    .select()
    .from(palpitesBolaoTable)
    .where(eq(palpitesBolaoTable.bolaoId, bolaoId));

  const aberto = apostasAbertas(bolao);
  const tipo = bolao.tipo === "normal" ? "🏆 Normal" : "📈 Acumulativo";

  let cor = COR_ATIVO;
  if (bolao.encerrado) cor = COR_ENCERRADO;
  else if (!aberto) cor = COR_AGUARDANDO;

  // ── Cabeçalho ──
  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`⚽  ${bolao.time1}  ×  ${bolao.time2}`)
    .setDescription(
      [
        `> ${tipo}  •  ID \`#${bolao.id}\``,
        "",
        bolao.encerrado
          ? `**✅ Bolão encerrado**`
          : aberto
          ? `**🟢 Apostas abertas** — encerram <t:${unixTimestamp(bolao.encerraEm)}:R>`
          : `**🔴 Apostas encerradas** — aguardando placar do admin`,
      ].join("\n")
    );

  // ── Prêmio / valor mínimo ──
  if (bolao.tipo === "normal" && bolao.premio) {
    embed.addFields(
      { name: "🎖️ Prêmio", value: `\`${bolao.premio}\``, inline: true },
      { name: "💸 Aposta mínima", value: `\`${bolao.valorMinimo}\``, inline: true }
    );
  } else {
    embed.addFields(
      { name: "📈 Prêmio", value: "Acumulativo (soma das apostas)", inline: true },
      { name: "💸 Aposta mínima", value: `\`${bolao.valorMinimo}\``, inline: true }
    );
  }

  // ── Placar atual / final ──
  if (bolao.golTime1 !== null && bolao.golTime2 !== null) {
    embed.addFields({
      name: bolao.encerrado ? "🏁 Placar Final" : "📊 Placar atual",
      value: `## ${bolao.time1}  **${bolao.golTime1}** — **${bolao.golTime2}**  ${bolao.time2}`,
      inline: false,
    });
  }

  // ── Separador visual ──
  embed.addFields({ name: "\u200B", value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬", inline: false });

  // ── Lista de palpites ──
  if (palpites.length === 0) {
    embed.addFields({
      name: `📋 Palpites — 0 participantes`,
      value: aberto
        ? "*Nenhum palpite ainda. Seja o primeiro!*"
        : "*Nenhum palpite foi registrado.*",
      inline: false,
    });
  } else {
    const lista = palpites
      .map((p) => `> 🎯 **${p.username}** — \`${p.golTime1} × ${p.golTime2}\`  •  apostou \`${p.apostado}\``)
      .join("\n");
    embed.addFields({
      name: `📋 Palpites — ${palpites.length} participante${palpites.length !== 1 ? "s" : ""}`,
      value: lista.slice(0, 1024),
      inline: false,
    });
  }

  // ── Resultado (se encerrado) ──
  if (bolao.encerrado && bolao.golTime1 !== null && bolao.golTime2 !== null) {
    const corretos = palpites.filter(
      (p) => p.golTime1 === bolao.golTime1 && p.golTime2 === bolao.golTime2
    );

    embed.addFields({ name: "\u200B", value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬", inline: false });

    if (corretos.length === 0) {
      embed.addFields({
        name: "😔 Resultado",
        value: "Nenhum participante acertou o placar exato.",
        inline: false,
      });
    } else {
      const vencedores = corretos
        .map((p) => `> 🥇 **${p.username}** — acertou \`${p.golTime1} × ${p.golTime2}\` (apostou \`${p.apostado}\`)`)
        .join("\n");
      embed.addFields({
        name: `🏆 Vencedor${corretos.length !== 1 ? "es" : ""} — ${corretos.length} pessoa${corretos.length !== 1 ? "s" : ""}`,
        value: vencedores.slice(0, 1024),
        inline: false,
      });
    }
  }

  embed.setFooter({
    text: bolao.encerrado
      ? "✅ Bolão encerrado • Prêmio a cargo do admin"
      : "🎯 Clique em Dar palpite para participar!",
  });

  return embed;
}

export function criarBotoesAtivo(bolaoId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bolao_palpite_${bolaoId}`)
      .setLabel("🎯 Dar palpite")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bolao_placar_${bolaoId}`)
      .setLabel("⚙️ Definir Placar")
      .setStyle(ButtonStyle.Secondary)
  );
}

export function criarBotoesAguardando(bolaoId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bolao_placar_${bolaoId}`)
      .setLabel("⚙️ Definir Placar")
      .setStyle(ButtonStyle.Danger)
  );
}

export async function encerrarApostas(client: Client, bolaoId: number) {
  try {
    const [bolao] = await db
      .select()
      .from(bolaoTable)
      .where(eq(bolaoTable.id, bolaoId))
      .limit(1);

    if (!bolao || bolao.encerrado) return;

    if (bolao.channelId && bolao.messageId) {
      try {
        const channel = await client.channels.fetch(bolao.channelId);
        if (channel?.isTextBased()) {
          const msg = await (channel as any).messages.fetch(bolao.messageId);
          const embed = await gerarEmbedBolao(bolaoId);
          if (embed) {
            await msg.edit({ embeds: [embed], components: [criarBotoesAguardando(bolaoId)] });
          }
        }
      } catch (e) {
        logger.warn({ err: e, bolaoId }, "Não foi possível atualizar embed ao fechar apostas");
      }
    }

    timersAtivos.delete(bolaoId);
    logger.info({ bolaoId }, "Apostas do bolão encerradas — aguardando placar do admin");
  } catch (err) {
    logger.error({ err, bolaoId }, "Erro ao encerrar apostas do bolão");
  }
}

export async function resolverBolao(
  client: Client,
  bolaoId: number,
  gol1: number,
  gol2: number,
  guildId: string
) {
  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao || bolao.encerrado) return;

  await db
    .update(bolaoTable)
    .set({ golTime1: gol1, golTime2: gol2, encerrado: true })
    .where(eq(bolaoTable.id, bolaoId));

  if (bolao.channelId && bolao.messageId) {
    try {
      const channel = await client.channels.fetch(bolao.channelId);
      if (channel?.isTextBased()) {
        const msg = await (channel as any).messages.fetch(bolao.messageId);
        const embed = await gerarEmbedBolao(bolaoId);
        if (embed) await msg.edit({ embeds: [embed], components: [] });
      }
    } catch (e) {
      logger.warn({ err: e, bolaoId }, "Não foi possível atualizar embed após resolução");
    }
  }

  timersAtivos.delete(bolaoId);
  logger.info({ bolaoId, gol1, gol2, guildId }, "Bolão resolvido");
}

export function agendarEncerramentoApostas(client: Client, bolaoId: number, encerraEm: Date) {
  if (timersAtivos.has(bolaoId)) return;
  const diff = encerraEm.getTime() - Date.now();
  if (diff <= 0) {
    encerrarApostas(client, bolaoId);
    return;
  }
  const timer = setTimeout(() => encerrarApostas(client, bolaoId), diff);
  timersAtivos.set(bolaoId, timer);
  logger.info({ bolaoId, diffMs: diff }, "Timer de apostas do bolão agendado");
}

export async function restaurarTimersBolao(client: Client) {
  try {
    const ativos = await db
      .select()
      .from(bolaoTable)
      .where(eq(bolaoTable.encerrado, false));

    logger.info({ count: ativos.length }, "Restaurando timers de bolões ativos");
    for (const bolao of ativos) {
      agendarEncerramentoApostas(client, bolao.id, bolao.encerraEm);
    }
  } catch (err) {
    logger.error({ err }, "Erro ao restaurar timers de bolões");
  }
}

export async function handleBolaoButton(interaction: ButtonInteraction) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_palpite_", ""), 10);
  if (isNaN(bolaoId)) return;

  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao) {
    await interaction.reply({ content: "❌ Bolão não encontrado.", ephemeral: true });
    return;
  }

  if (bolao.encerrado || bolao.encerraEm <= new Date()) {
    await interaction.reply({
      content: "❌ As apostas deste bolão já foram encerradas.",
      ephemeral: true,
    });
    return;
  }

  const jaParticipou = await db
    .select()
    .from(palpitesBolaoTable)
    .where(
      and(
        eq(palpitesBolaoTable.bolaoId, bolaoId),
        eq(palpitesBolaoTable.userId, interaction.user.id)
      )
    )
    .limit(1);

  if (jaParticipou.length > 0) {
    await interaction.reply({
      content: "❌ Você já deu seu palpite neste bolão.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`bolao_modal_${bolaoId}`)
    .setTitle(`⚽ Palpite: ${bolao.time1} × ${bolao.time2}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time1")
        .setLabel(`Gols do ${bolao.time1}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 2")
        .setMinLength(1).setMaxLength(2).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time2")
        .setLabel(`Gols do ${bolao.time2}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 1")
        .setMinLength(1).setMaxLength(2).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("aposta")
        .setLabel(`Quanto você está apostando (mínimo: ${bolao.valorMinimo})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Ex: ${bolao.valorMinimo}`)
        .setMinLength(1).setMaxLength(50).setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

export async function handleBolaoModal(client: Client, interaction: ModalSubmitInteraction) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_modal_", ""), 10);
  if (isNaN(bolaoId)) return;

  const golTime1 = parseInt(interaction.fields.getTextInputValue("gol_time1").trim(), 10);
  const golTime2 = parseInt(interaction.fields.getTextInputValue("gol_time2").trim(), 10);
  const aposta = interaction.fields.getTextInputValue("aposta").trim();

  if (isNaN(golTime1) || isNaN(golTime2) || golTime1 < 0 || golTime2 < 0) {
    await interaction.reply({
      content: "❌ Gols inválidos. Informe números inteiros ≥ 0.",
      ephemeral: true,
    });
    return;
  }

  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao || bolao.encerrado || bolao.encerraEm <= new Date()) {
    await interaction.reply({
      content: "❌ As apostas deste bolão já foram encerradas.",
      ephemeral: true,
    });
    return;
  }

  try {
    await db.insert(palpitesBolaoTable).values({
      bolaoId,
      userId: interaction.user.id,
      username: interaction.user.username,
      golTime1,
      golTime2,
      apostado: aposta,
    });
  } catch {
    await interaction.reply({
      content: "❌ Você já deu seu palpite neste bolão.",
      ephemeral: true,
    });
    return;
  }

  if (bolao.channelId && bolao.messageId) {
    try {
      const channel = await client.channels.fetch(bolao.channelId);
      if (channel?.isTextBased()) {
        const msg = await (channel as any).messages.fetch(bolao.messageId);
        const embed = await gerarEmbedBolao(bolaoId);
        if (embed) await msg.edit({ embeds: [embed], components: [criarBotoesAtivo(bolaoId)] });
      }
    } catch (e) {
      logger.warn({ err: e, bolaoId }, "Não foi possível atualizar embed após palpite");
    }
  }

  await interaction.reply({
    content: `✅ Palpite registrado! **${bolao.time1} ${golTime1} × ${golTime2} ${bolao.time2}** — você apostou \`${aposta}\`.`,
    ephemeral: true,
  });
}

export async function handleDefinirPlacarButton(interaction: ButtonInteraction) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_placar_", ""), 10);
  if (isNaN(bolaoId)) return;

  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }

  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao || bolao.encerrado) {
    await interaction.reply({
      content: bolao ? "❌ Este bolão já foi encerrado." : "❌ Bolão não encontrado.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`bolao_placar_modal_${bolaoId}`)
    .setTitle(`⚙️ Placar final: ${bolao.time1} × ${bolao.time2}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time1")
        .setLabel(`Gols do ${bolao.time1}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 2")
        .setValue(bolao.golTime1 !== null ? String(bolao.golTime1) : "")
        .setMinLength(1).setMaxLength(2).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time2")
        .setLabel(`Gols do ${bolao.time2}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 1")
        .setValue(bolao.golTime2 !== null ? String(bolao.golTime2) : "")
        .setMinLength(1).setMaxLength(2).setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

export async function handleDefinirPlacarModal(
  client: Client,
  interaction: ModalSubmitInteraction
) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_placar_modal_", ""), 10);
  if (isNaN(bolaoId)) return;

  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }

  const gol1 = parseInt(interaction.fields.getTextInputValue("gol_time1").trim(), 10);
  const gol2 = parseInt(interaction.fields.getTextInputValue("gol_time2").trim(), 10);

  if (isNaN(gol1) || isNaN(gol2) || gol1 < 0 || gol2 < 0) {
    await interaction.reply({
      content: "❌ Placar inválido. Informe números inteiros ≥ 0.",
      ephemeral: true,
    });
    return;
  }

  const [bolao] = await db
    .select()
    .from(bolaoTable)
    .where(eq(bolaoTable.id, bolaoId))
    .limit(1);

  if (!bolao || bolao.encerrado) {
    await interaction.reply({
      content: "❌ Bolão não encontrado ou já encerrado.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await resolverBolao(client, bolaoId, gol1, gol2, bolao.guildId);

  await interaction.editReply({
    content: `✅ Placar definido: **${bolao.time1} ${gol1} × ${gol2} ${bolao.time2}**\nBolão encerrado — vencedores anunciados na embed!`,
  });
}
