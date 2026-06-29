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
  Colors,
} from "discord.js";
import { db } from "@workspace/db";
import { bolaoTable, palpitesBolaoTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";
import { isAdmin, ADMIN_DENY_MSG } from "./admin-check.js";
import { deductMoedas, addMoedas } from "./moedas.js";

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

  const totalApostado = palpites.reduce((acc, p) => acc + p.apostado, 0);
  const premioExibido =
    bolao.tipo === "acumulativo"
      ? `${totalApostado} moedas (acumulado)`
      : `${bolao.premio} moedas`;

  const aberto = apostasAbertas(bolao);

  let color = Colors.Gold;
  if (bolao.encerrado) color = Colors.DarkGreen;
  else if (!aberto) color = Colors.Orange;

  const embed = new EmbedBuilder()
    .setTitle(`⚽ Bolão: ${bolao.time1} 🆚 ${bolao.time2}`)
    .setColor(color)
    .addFields(
      {
        name: "🏷️ Tipo",
        value: bolao.tipo === "normal" ? "Normal (prêmio fixo)" : "Acumulativo",
        inline: true,
      },
      {
        name: "💰 Prêmio",
        value: premioExibido,
        inline: true,
      },
      {
        name: "💸 Aposta mínima",
        value: `${bolao.valorMinimo} moedas`,
        inline: true,
      }
    );

  if (aberto) {
    embed.addFields({
      name: "⏰ Apostas encerram",
      value: `<t:${unixTimestamp(bolao.encerraEm)}:R> (<t:${unixTimestamp(bolao.encerraEm)}:T>)`,
      inline: false,
    });
  } else if (!bolao.encerrado) {
    embed.addFields({
      name: "🔒 Status",
      value: "Apostas encerradas — aguardando placar do admin",
      inline: false,
    });
  }

  if (bolao.golTime1 !== null && bolao.golTime2 !== null) {
    embed.addFields({
      name: "📊 Placar atual",
      value: `**${bolao.time1} ${bolao.golTime1} × ${bolao.golTime2} ${bolao.time2}**`,
      inline: false,
    });
  }

  if (palpites.length === 0) {
    embed.addFields({
      name: `📋 Palpites (0)`,
      value: aberto
        ? "Nenhum palpite ainda. Clique em **🎯 Dar palpite** para participar!"
        : "Nenhum palpite foi registrado.",
      inline: false,
    });
  } else {
    const lista = palpites
      .map(
        (p) =>
          `> 🎯 **${p.username}** — ${p.golTime1} × ${p.golTime2} *(${p.apostado} moedas)*`
      )
      .join("\n");
    embed.addFields({
      name: `📋 Palpites (${palpites.length})`,
      value: lista.slice(0, 1024),
      inline: false,
    });
  }

  if (bolao.encerrado && bolao.golTime1 !== null && bolao.golTime2 !== null) {
    const corretos = palpites.filter(
      (p) => p.golTime1 === bolao.golTime1 && p.golTime2 === bolao.golTime2
    );
    const premioFinal =
      bolao.tipo === "acumulativo" ? totalApostado : (bolao.premio ?? 0);

    embed.addFields({
      name: "🏁 Placar final",
      value: `**${bolao.time1} ${bolao.golTime1} × ${bolao.golTime2} ${bolao.time2}**`,
      inline: false,
    });

    if (corretos.length === 0) {
      embed.addFields({
        name: "😔 Vencedores",
        value: "Nenhum acertou o placar exato. As moedas foram devolvidas a todos!",
        inline: false,
      });
    } else {
      const ganho = Math.floor(premioFinal / corretos.length);
      const lista = corretos
        .map((p) => `> 🥇 **${p.username}** — ganhou **${ganho} moedas!**`)
        .join("\n");
      embed.addFields({
        name: `🏆 Vencedores (${corretos.length})`,
        value: lista.slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({ text: "✅ Bolão encerrado" });
  }

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

// Chamado quando o timer expira — fecha as apostas mas não distribui prêmios
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
            await msg.edit({
              embeds: [embed],
              components: [criarBotoesAguardando(bolaoId)],
            });
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

// Chamado pelo admin — distribui prêmios e marca como encerrado
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

  const palpites = await db
    .select()
    .from(palpitesBolaoTable)
    .where(eq(palpitesBolaoTable.bolaoId, bolaoId));

  const corretos = palpites.filter(
    (p) => p.golTime1 === gol1 && p.golTime2 === gol2
  );
  const totalApostado = palpites.reduce((acc, p) => acc + p.apostado, 0);
  const premioFinal =
    bolao.tipo === "acumulativo" ? totalApostado : (bolao.premio ?? 0);

  if (corretos.length === 0) {
    for (const p of palpites) {
      await addMoedas(guildId, p.userId, p.username, p.apostado);
    }
  } else {
    const ganho = Math.floor(premioFinal / corretos.length);
    for (const p of corretos) {
      await addMoedas(guildId, p.userId, p.username, ganho);
    }
  }

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
  logger.info({ bolaoId, gol1, gol2 }, "Bolão resolvido com sucesso");
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
        .setLabel(`Valor apostado (mínimo: ${bolao.valorMinimo} moedas)`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Ex: ${bolao.valorMinimo}`)
        .setMinLength(1).setMaxLength(6).setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

export async function handleBolaoModal(client: Client, interaction: ModalSubmitInteraction) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_modal_", ""), 10);
  if (isNaN(bolaoId)) return;

  const golTime1 = parseInt(interaction.fields.getTextInputValue("gol_time1").trim(), 10);
  const golTime2 = parseInt(interaction.fields.getTextInputValue("gol_time2").trim(), 10);
  const aposta = parseInt(interaction.fields.getTextInputValue("aposta").trim(), 10);

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

  if (isNaN(aposta) || aposta < bolao.valorMinimo) {
    await interaction.reply({
      content: `❌ Valor inválido. O mínimo é **${bolao.valorMinimo} moedas**.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await deductMoedas(bolao.guildId, interaction.user.id, interaction.user.username, aposta);
  } catch {
    await interaction.reply({
      content: `❌ Saldo insuficiente. Você precisa de **${aposta} moedas** para apostar.`,
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
    await addMoedas(bolao.guildId, interaction.user.id, interaction.user.username, aposta);
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
    content: `✅ Palpite registrado! **${bolao.time1} ${golTime1} × ${golTime2} ${bolao.time2}** — apostou **${aposta} moedas**.`,
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

  if (!bolao) {
    await interaction.reply({ content: "❌ Bolão não encontrado.", ephemeral: true });
    return;
  }

  if (bolao.encerrado) {
    await interaction.reply({
      content: "❌ Este bolão já foi encerrado e o placar definido.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`bolao_placar_modal_${bolaoId}`)
    .setTitle(`⚙️ Definir Placar: ${bolao.time1} × ${bolao.time2}`);

  const atual1 = bolao.golTime1 !== null ? String(bolao.golTime1) : "";
  const atual2 = bolao.golTime2 !== null ? String(bolao.golTime2) : "";

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time1")
        .setLabel(`Gols do ${bolao.time1} (placar final)`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 2")
        .setValue(atual1)
        .setMinLength(1).setMaxLength(2).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("gol_time2")
        .setLabel(`Gols do ${bolao.time2} (placar final)`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 1")
        .setValue(atual2)
        .setMinLength(1).setMaxLength(2).setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

export async function handleDefinirPlacarModal(
  client: Client,
  interaction: ModalSubmitInteraction
) {
  const bolaoId = parseInt(
    interaction.customId.replace("bolao_placar_modal_", ""),
    10
  );
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
    content: `✅ Placar definido: **${bolao.time1} ${gol1} × ${gol2} ${bolao.time2}**\nPrêmios distribuídos e bolão encerrado!`,
  });
}
