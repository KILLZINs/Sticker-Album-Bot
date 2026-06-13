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
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { verificarConquistas } from "../lib/conquistas.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";
import { getSaldo, deductMoedas, addMoedas } from "../lib/moedas.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";
import { getGuildFigurinhaConfig, getMoedasMaxPorRaridade } from "../lib/figurinha-config.js";

export const data = new SlashCommandBuilder()
  .setName("trocar")
  .setDescription("Propõe uma troca de figurinha (com ou sem moedas) com outro usuário")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Com quem você quer trocar").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("minha-figurinha").setDescription("Número da figurinha que você vai dar").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((opt) =>
    opt.setName("figurinha-deles").setDescription("Número da figurinha que você quer receber").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((opt) =>
    opt.setName("minhas-moedas").setDescription("Moedas extras que você oferece junto").setRequired(false).setMinValue(0)
  )
  .addIntegerOption((opt) =>
    opt.setName("moedas-deles").setDescription("Moedas extras que você pede da outra parte").setRequired(false).setMinValue(0)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const destino = interaction.options.getUser("usuario", true);
  const meuNumero = interaction.options.getInteger("minha-figurinha", true);
  const delesNumero = interaction.options.getInteger("figurinha-deles", true);
  const minhasMoedas = interaction.options.getInteger("minhas-moedas") ?? 0;
  const moedasDeles = interaction.options.getInteger("moedas-deles") ?? 0;
  const guildId = interaction.guildId!;
  const meuId = interaction.user.id;

  if (destino.id === meuId) { await interaction.editReply("❌ Você não pode trocar com você mesmo!"); return; }
  if (destino.bot) { await interaction.editReply("❌ Você não pode trocar com bots!"); return; }

  try {
    const [emojis, moedaCfg, figCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
      getGuildFigurinhaConfig(guildId),
    ]);

    const nomeMoeda = moedaCfg.nomeMoeda;

    if ((minhasMoedas > 0 || moedasDeles > 0) && !figCfg.trocaMoedasHabilitado) {
      await interaction.editReply("❌ Moedas em trocas estão **desabilitadas** neste servidor."); return;
    }

    const [minhaFigResult, deleFigResult] = await Promise.all([
      db.select().from(catalogoFigurinhasTable)
        .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, meuNumero))).limit(1),
      db.select().from(catalogoFigurinhasTable)
        .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, delesNumero))).limit(1),
    ]);

    const minhaFig = minhaFigResult[0];
    const deleFig = deleFigResult[0];

    if (!minhaFig) { await interaction.editReply(`❌ Figurinha #${meuNumero} não existe no catálogo!`); return; }
    if (!deleFig) { await interaction.editReply(`❌ Figurinha #${delesNumero} não existe no catálogo!`); return; }

    if (minhasMoedas > 0) {
      const maxMinhas = getMoedasMaxPorRaridade(figCfg, deleFig.raridade);
      if (minhasMoedas > maxMinhas) {
        await interaction.editReply(`❌ Máximo de ${nomeMoeda} que pode oferecer por uma figurinha **${deleFig.raridade}**: **${maxMinhas}**.`); return;
      }
    }
    if (moedasDeles > 0) {
      const maxDeles = getMoedasMaxPorRaridade(figCfg, minhaFig.raridade);
      if (moedasDeles > maxDeles) {
        await interaction.editReply(`❌ Máximo de ${nomeMoeda} que pode pedir por uma figurinha **${minhaFig.raridade}**: **${maxDeles}**.`); return;
      }
    }

    const [minhaNaColecao, deleNaColecao] = await Promise.all([
      db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, meuId), eq(colecaoUsuarioTable.catalogoId, minhaFig.id))).limit(1),
      db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, destino.id), eq(colecaoUsuarioTable.catalogoId, deleFig.id))).limit(1),
    ]);

    if (!minhaNaColecao[0]) { await interaction.editReply(`❌ Você não tem a figurinha **#${meuNumero} — ${minhaFig.titulo}**!`); return; }
    if (!deleNaColecao[0]) { await interaction.editReply(`❌ <@${destino.id}> não tem a figurinha **#${delesNumero} — ${deleFig.titulo}**!`); return; }

    if (minhasMoedas > 0) {
      const meuSaldo = await getSaldo(guildId, meuId);
      if (meuSaldo < minhasMoedas) {
        await interaction.editReply(`❌ Você não tem ${nomeMoeda} suficientes! (Você tem **${meuSaldo}**, precisa de **${minhasMoedas}**)`); return;
      }
    }

    const emojiMinha = getRaridadeEmoji(emojis, minhaFig.raridade);
    const emojiDele = getRaridadeEmoji(emojis, deleFig.raridade);

    const descricaoTroca = [
      `**<@${meuId}> oferece:**`,
      `${emojiMinha} **#${minhaFig.numero}** ${minhaFig.titulo} *(${minhaFig.raridade})*`,
      minhasMoedas > 0 ? `+ ${emojis.moedas} **${minhasMoedas}** ${nomeMoeda}` : null,
      ``,
      `**<@${meuId}> pede de <@${destino.id}>:**`,
      `${emojiDele} **#${deleFig.numero}** ${deleFig.titulo} *(${deleFig.raridade})*`,
      moedasDeles > 0 ? `+ ${emojis.moedas} **${moedasDeles}** ${nomeMoeda}` : null,
    ].filter(Boolean).join("\n");

    // IDs únicos por interação para evitar conflito entre múltiplas trocas
    const uid = interaction.id;
    const idAceitar = `troca_aceitar_${uid}`;
    const idRecusar = `troca_recusar_${uid}`;

    const embed = new EmbedBuilder()
      .setTitle("🔄 Proposta de Troca!")
      .setDescription(`<@${destino.id}>, você recebeu uma proposta!\n\n${descricaoTroca}`)
      .setColor(0x7B2FBE)
      .setFooter({ text: `Proposta expira em 60 segundos • Apenas ${destino.username} pode responder` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(idAceitar).setLabel("✅ Aceitar troca").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(idRecusar).setLabel("❌ Recusar").setStyle(ButtonStyle.Danger),
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    // Collector sem filtro — responde corretamente para qualquer usuário
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (btn) => {
      // Usuário errado clicou — responde de forma efêmera e não fecha o collector
      if (btn.user.id !== destino.id) {
        await btn.reply({ content: `❌ Esta proposta é para <@${destino.id}>. Você não pode respondê-la.`, ephemeral: true });
        return;
      }

      collector.stop("respondido");

      if (btn.customId === idRecusar) {
        const embedRecusado = new EmbedBuilder()
          .setDescription(`❌ <@${destino.id}> recusou a proposta de troca.`)
          .setColor(0xe74c3c);
        await btn.update({ embeds: [embedRecusado], components: [] });
        return;
      }

      // Aceitar — revalidar tudo
      try {
        const [minhaAinda, deleAinda] = await Promise.all([
          db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
            .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, meuId), eq(colecaoUsuarioTable.catalogoId, minhaFig.id))).limit(1),
          db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
            .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, destino.id), eq(colecaoUsuarioTable.catalogoId, deleFig.id))).limit(1),
        ]);

        if (!minhaAinda[0]) { await btn.update({ content: `❌ <@${meuId}> não tem mais a figurinha **${minhaFig.titulo}**.`, embeds: [], components: [] }); return; }
        if (!deleAinda[0]) { await btn.update({ content: `❌ <@${destino.id}> não tem mais a figurinha **${deleFig.titulo}**.`, embeds: [], components: [] }); return; }

        if (minhasMoedas > 0) {
          const meuSaldoAtual = await getSaldo(guildId, meuId);
          if (meuSaldoAtual < minhasMoedas) { await btn.update({ content: `❌ <@${meuId}> não tem mais ${nomeMoeda} suficientes.`, embeds: [], components: [] }); return; }
        }
        if (moedasDeles > 0) {
          const saldoDeles = await getSaldo(guildId, destino.id);
          if (saldoDeles < moedasDeles) { await btn.update({ content: `❌ <@${destino.id}> não tem ${nomeMoeda} suficientes.`, embeds: [], components: [] }); return; }
        }

        // Trocar figurinhas
        await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, minhaAinda[0].id));
        await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, deleAinda[0].id));
        await db.insert(colecaoUsuarioTable).values({ guildId, userId: destino.id, username: destino.username, catalogoId: minhaFig.id });
        await db.insert(colecaoUsuarioTable).values({ guildId, userId: meuId, username: interaction.user.username, catalogoId: deleFig.id });

        // Transferir moedas
        if (minhasMoedas > 0) {
          await deductMoedas(guildId, meuId, interaction.user.username, minhasMoedas);
          await addMoedas(guildId, destino.id, destino.username, minhasMoedas);
        }
        if (moedasDeles > 0) {
          await deductMoedas(guildId, destino.id, destino.username, moedasDeles);
          await addMoedas(guildId, meuId, interaction.user.username, moedasDeles);
        }

        await Promise.all([
          verificarConquistas(guildId, meuId, interaction.user.username, { fezTroca: true }),
          verificarConquistas(guildId, destino.id, destino.username, { fezTroca: true }),
        ]);

        const embedSucesso = new EmbedBuilder()
          .setTitle("✅ Troca concluída!")
          .setDescription(
            `**<@${meuId}>** recebeu: ${emojiDele} **${deleFig.titulo}**${moedasDeles > 0 ? ` + ${emojis.moedas} ${moedasDeles} ${nomeMoeda}` : ""}\n` +
            `**<@${destino.id}>** recebeu: ${emojiMinha} **${minhaFig.titulo}**${minhasMoedas > 0 ? ` + ${emojis.moedas} ${minhasMoedas} ${nomeMoeda}` : ""}`
          )
          .setColor(0x57f287)
          .setTimestamp();

        await btn.update({ embeds: [embedSucesso], components: [] });
      } catch (err) {
        logger.error({ err }, "Erro ao executar troca");
        await btn.update({ content: "❌ Erro ao executar a troca. Tente novamente.", embeds: [], components: [] });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "respondido") {
        await interaction.editReply({ content: "⏰ Proposta de troca expirou.", embeds: [], components: [] }).catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao propor troca");
    await interaction.editReply("❌ Erro ao processar a troca. Tente novamente.");
  }
}
