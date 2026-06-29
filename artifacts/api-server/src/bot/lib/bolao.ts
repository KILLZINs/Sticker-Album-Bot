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
import { deductMoedas, addMoedas } from "./moedas.js";

// Map de timers ativos para evitar duplicados após restart
const timersAtivos = new Map<number, ReturnType<typeof setTimeout>>();

export function formatarTempoRestante(encerraEm: Date): string {
  const diff = encerraEm.getTime() - Date.now();
  if (diff <= 0) return "⌛ Encerrado";
  const total = Math.floor(diff / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function unixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
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
  const premioFinal =
    bolao.tipo === "acumulativo" ? totalApostado : (bolao.premio ?? 0);

  const embed = new EmbedBuilder()
    .setTitle(`⚽ Bolão: ${bolao.time1} 🆚 ${bolao.time2}`)
    .setColor(bolao.encerrado ? Colors.DarkRed : Colors.Gold)
    .addFields(
      {
        name: "🏷️ Tipo",
        value: bolao.tipo === "normal" ? "Normal (prêmio fixo)" : "Acumulativo",
        inline: true,
      },
      {
        name: "💰 Prêmio",
        value:
          bolao.tipo === "acumulativo"
            ? `${totalApostado} moedas (acumulado)`
            : `${bolao.premio} moedas`,
        inline: true,
      },
      {
        name: "💸 Aposta mínima",
        value: `${bolao.valorMinimo} moedas`,
        inline: true,
      }
    );

  if (!bolao.encerrado) {
    embed.addFields({
      name: "⏰ Encerra",
      value: `<t:${unixTimestamp(bolao.encerraEm)}:R> (<t:${unixTimestamp(bolao.encerraEm)}:T>)`,
      inline: false,
    });
  }

  if (palpites.length === 0) {
    embed.addFields({
      name: `📋 Palpites (0)`,
      value: "Nenhum palpite ainda. Clique em **Dar palpite** para participar!",
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

  if (bolao.encerrado) {
    const corretos = palpites.filter(
      (p) => p.golTime1 === bolao.golTime1 && p.golTime2 === bolao.golTime2
    );

    embed.addFields({
      name: "🏁 Resultado oficial",
      value: `**${bolao.time1} ${bolao.golTime1} × ${bolao.golTime2} ${bolao.time2}**`,
      inline: false,
    });

    if (corretos.length === 0) {
      embed.addFields({
        name: "😔 Vencedores",
        value: "Nenhum acertou o placar exato. As moedas foram devolvidas!",
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

    embed.setFooter({ text: "Bolão encerrado" });
  }

  return embed;
}

export async function encerrarBolao(client: Client, bolaoId: number) {
  try {
    const [bolao] = await db
      .select()
      .from(bolaoTable)
      .where(eq(bolaoTable.id, bolaoId))
      .limit(1);

    if (!bolao || bolao.encerrado) return;

    await db
      .update(bolaoTable)
      .set({ encerrado: true })
      .where(eq(bolaoTable.id, bolaoId));

    const palpites = await db
      .select()
      .from(palpitesBolaoTable)
      .where(eq(palpitesBolaoTable.bolaoId, bolaoId));

    const corretos = palpites.filter(
      (p) => p.golTime1 === bolao.golTime1 && p.golTime2 === bolao.golTime2
    );

    const totalApostado = palpites.reduce((acc, p) => acc + p.apostado, 0);
    const premioFinal =
      bolao.tipo === "acumulativo" ? totalApostado : (bolao.premio ?? 0);

    if (corretos.length === 0) {
      // Devolver moedas para todos
      for (const p of palpites) {
        await addMoedas(bolao.guildId, p.userId, p.username, p.apostado);
      }
    } else {
      const ganho = Math.floor(premioFinal / corretos.length);
      for (const p of corretos) {
        await addMoedas(bolao.guildId, p.userId, p.username, ganho);
      }
      // No tipo "normal", se o prêmio for maior que o total apostado,
      // as moedas extras já foram descontadas do criador no momento da criação
    }

    // Atualizar embed na mensagem
    if (bolao.channelId && bolao.messageId) {
      try {
        const channel = await client.channels.fetch(bolao.channelId);
        if (channel?.isTextBased()) {
          const msg = await (channel as any).messages.fetch(bolao.messageId);
          const embed = await gerarEmbedBolao(bolaoId);
          if (embed) {
            await msg.edit({ embeds: [embed], components: [] });
          }
        }
      } catch (e) {
        logger.warn({ err: e, bolaoId }, "Não foi possível atualizar embed do bolão encerrado");
      }
    }

    timersAtivos.delete(bolaoId);
    logger.info({ bolaoId }, "Bolão encerrado com sucesso");
  } catch (err) {
    logger.error({ err, bolaoId }, "Erro ao encerrar bolão");
  }
}

export function agendarEncerramentoBolao(client: Client, bolaoId: number, encerraEm: Date) {
  if (timersAtivos.has(bolaoId)) return;

  const diff = encerraEm.getTime() - Date.now();
  if (diff <= 0) {
    encerrarBolao(client, bolaoId);
    return;
  }

  const timer = setTimeout(() => encerrarBolao(client, bolaoId), diff);
  timersAtivos.set(bolaoId, timer);
  logger.info({ bolaoId, diffMs: diff }, "Timer do bolão agendado");
}

export async function restaurarTimersBolao(client: Client) {
  try {
    const ativos = await db
      .select()
      .from(bolaoTable)
      .where(eq(bolaoTable.encerrado, false));

    logger.info({ count: ativos.length }, "Restaurando timers de bolões ativos");

    for (const bolao of ativos) {
      agendarEncerramentoBolao(client, bolao.id, bolao.encerraEm);
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
    await interaction.reply({ content: "❌ Este bolão já foi encerrado.", ephemeral: true });
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

  const inputTime1 = new TextInputBuilder()
    .setCustomId("gol_time1")
    .setLabel(`Gols do ${bolao.time1}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 2")
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  const inputTime2 = new TextInputBuilder()
    .setCustomId("gol_time2")
    .setLabel(`Gols do ${bolao.time2}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: 1")
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  const inputAposta = new TextInputBuilder()
    .setCustomId("aposta")
    .setLabel(`Valor apostado (mínimo: ${bolao.valorMinimo} moedas)`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Ex: ${bolao.valorMinimo}`)
    .setMinLength(1)
    .setMaxLength(6)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputTime1),
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputTime2),
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputAposta)
  );

  await interaction.showModal(modal);
}

export async function handleBolaoModal(
  client: Client,
  interaction: ModalSubmitInteraction
) {
  const bolaoId = parseInt(interaction.customId.replace("bolao_modal_", ""), 10);
  if (isNaN(bolaoId)) return;

  const golTime1Raw = interaction.fields.getTextInputValue("gol_time1").trim();
  const golTime2Raw = interaction.fields.getTextInputValue("gol_time2").trim();
  const apostaRaw = interaction.fields.getTextInputValue("aposta").trim();

  const golTime1 = parseInt(golTime1Raw, 10);
  const golTime2 = parseInt(golTime2Raw, 10);
  const aposta = parseInt(apostaRaw, 10);

  if (isNaN(golTime1) || isNaN(golTime2) || golTime1 < 0 || golTime2 < 0) {
    await interaction.reply({
      content: "❌ Gols inválidos. Informe números inteiros maiores ou iguais a 0.",
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
    await interaction.reply({ content: "❌ Este bolão já foi encerrado.", ephemeral: true });
    return;
  }

  if (isNaN(aposta) || aposta < bolao.valorMinimo) {
    await interaction.reply({
      content: `❌ Valor apostado inválido. O mínimo é **${bolao.valorMinimo} moedas**.`,
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
    // Reverter dedução se não conseguir salvar
    await addMoedas(bolao.guildId, interaction.user.id, interaction.user.username, aposta);
    await interaction.reply({
      content: "❌ Você já deu seu palpite neste bolão.",
      ephemeral: true,
    });
    return;
  }

  // Atualizar embed
  if (bolao.channelId && bolao.messageId) {
    try {
      const channel = await client.channels.fetch(bolao.channelId);
      if (channel?.isTextBased()) {
        const msg = await (channel as any).messages.fetch(bolao.messageId);
        const embed = await gerarEmbedBolao(bolaoId);
        const row = criarBotaoPalpite(bolaoId);
        if (embed) await msg.edit({ embeds: [embed], components: [row] });
      }
    } catch (e) {
      logger.warn({ err: e, bolaoId }, "Não foi possível atualizar embed após palpite");
    }
  }

  await interaction.reply({
    content: `✅ Palpite registrado! **${bolao.time1} ${golTime1} × ${golTime2} ${bolao.time2}** — Apostou **${aposta} moedas**.`,
    ephemeral: true,
  });
}

export function criarBotaoPalpite(bolaoId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bolao_palpite_${bolaoId}`)
      .setLabel("🎯 Dar palpite")
      .setStyle(ButtonStyle.Primary)
  );
}
