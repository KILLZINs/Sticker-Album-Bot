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
import { verificarConquistas, anunciarConquistas } from "../lib/conquistas.js";
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
      db.select().from(catalogoFigurinhasTable).where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, meuNumero))).limit(1),
      db.select().from(catalogoFigurinhasTable).where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, delesNumero))).limit(1),
    ]);

    const minhaFig = minhaFigResult[0];
    const deleFig = deleFigResult[0];

    if (!minhaFig) { await interaction.editReply(`❌ Figurinha **#${meuNumero}** não existe no catálogo!`); return; }
    if (!deleFig) { await interaction.editReply(`❌ Figurinha **#${delesNumero}** não existe no catálogo!`); return; }

    if (minhasMoedas > 0) {
      const maxMinhas = getMoedasMaxPorRaridade(figCfg, deleFig.raridade);
      if (minhasMoedas > maxMinhas) { await interaction.editReply(`❌ Máximo de ${nomeMoeda} por figurinha **${deleFig.raridade}**: **${maxMinhas}**.`); return; }
    }
    if (moedasDeles > 0) {
      const maxDeles = getMoedasMaxPorRaridade(figCfg, minhaFig.raridade);
      if (moedasDeles > maxDeles) { await interaction.editReply(`❌ Máximo de ${nomeMoeda} por figurinha **${minhaFig.raridade}**: **${maxDeles}**.`); return; }
    }

    const [minhaNaColecao, deleNaColecao] = await Promise.all([
      db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable).where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, meuId), eq(colecaoUsuarioTable.catalogoId, minhaFig.id))).limit(1),
      db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable).where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, destino.id), eq(colecaoUsuarioTable.catalogoId, deleFig.id))).limit(1),
    ]);

    if (!minhaNaColecao[0]) { await interaction.editReply(`❌ Você não tem a figurinha **#${meuNumero} — ${minhaFig.titulo}**!`); return; }
    if (!deleNaColecao[0]) { await interaction.editReply(`❌ <@${destino.id}> não tem a figurinha **#${delesNumero} — ${deleFig.titulo}**!`); return; }

    if (minhasMoedas > 0) {
      const meuSaldo = await getSaldo(guildId, meuId);
      if (meuSaldo < minhasMoedas) { await interaction.editReply(`❌ Você não tem ${nomeMoeda} suficientes! (Tem: **${meuSaldo}**, precisa: **${minhasMoedas}**)`); return; }
    }

    const emojiMinha = getRaridadeEmoji(emojis, minhaFig.raridade);
    const emojiDele = getRaridadeEmoji(emojis, deleFig.raridade);
    const minhaRar = minhaFig.raridade.charAt(0).toUpperCase() + minhaFig.raridade.slice(1);
    const deleRar = deleFig.raridade.charAt(0).toUpperCase() + deleFig.raridade.slice(1);

    const ofertaEu =
      `${emojiMinha} **${minhaFig.titulo}**\n┗ ${minhaRar} · #${minhaFig.numero}` +
      (minhasMoedas > 0 ? `\n${emojis.moedas} + **${minhasMoedas.toLocaleString("pt-BR")}** ${nomeMoeda}` : "");

    const ofertaDele =
      `${emojiDele} **${deleFig.titulo}**\n┗ ${deleRar} · #${deleFig.numero}` +
      (moedasDeles > 0 ? `\n${emojis.moedas} + **${moedasDeles.toLocaleString("pt-BR")}** ${nomeMoeda}` : "");

    const uid = interaction.id;
    const idAceitar = `troca_aceitar_${uid}`;
    const idRecusar = `troca_recusar_${uid}`;

    const embed = new EmbedBuilder()
      .setTitle("🔄 Proposta de Troca!")
      .setDescription(`<@${destino.id}>, **<@${meuId}> quer trocar com você!**`)
      .setColor(0x7B2FBE)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: `📤 ${interaction.user.username} oferece`,
          value: ofertaEu,
          inline: true,
        },
        {
          name: `📥 ${interaction.user.username} pede`,
          value: ofertaDele,
          inline: true,
        },
      )
      .setFooter({ text: `Proposta expira em 60s · Apenas ${destino.username} pode responder` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(idAceitar).setLabel("✅ Aceitar troca").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(idRecusar).setLabel("❌ Recusar").setStyle(ButtonStyle.Danger),
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== destino.id) {
        await btn.reply({ content: `❌ Esta proposta é para <@${destino.id}>. Você não pode respondê-la.`, ephemeral: true });
        return;
      }

      collector.stop("respondido");

      if (btn.customId === idRecusar) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("❌ Troca Recusada")
              .setDescription(`<@${destino.id}> recusou a proposta de troca de <@${meuId}>.`)
              .setColor(0xe74c3c)
              .setTimestamp(),
          ],
          components: [],
        });
        return;
      }

      // Aceitar — revalidar antes de executar
      try {
        const [minhaAinda, deleAinda] = await Promise.all([
          db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable).where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, meuId), eq(colecaoUsuarioTable.catalogoId, minhaFig.id))).limit(1),
          db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable).where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, destino.id), eq(colecaoUsuarioTable.catalogoId, deleFig.id))).limit(1),
        ]);

        if (!minhaAinda[0]) { await btn.update({ content: `❌ <@${meuId}> não tem mais a figurinha **${minhaFig.titulo}**.`, embeds: [], components: [] }); return; }
        if (!deleAinda[0]) { await btn.update({ content: `❌ <@${destino.id}> não tem mais a figurinha **${deleFig.titulo}**.`, embeds: [], components: [] }); return; }

        if (minhasMoedas > 0 && (await getSaldo(guildId, meuId)) < minhasMoedas) {
          await btn.update({ content: `❌ <@${meuId}> não tem mais ${nomeMoeda} suficientes.`, embeds: [], components: [] }); return;
        }
        if (moedasDeles > 0 && (await getSaldo(guildId, destino.id)) < moedasDeles) {
          await btn.update({ content: `❌ <@${destino.id}> não tem ${nomeMoeda} suficientes.`, embeds: [], components: [] }); return;
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

        const [novasMeu, novasDele] = await Promise.all([
          verificarConquistas(guildId, meuId, interaction.user.username, { fezTroca: true }),
          verificarConquistas(guildId, destino.id, destino.username, { fezTroca: true }),
        ]);
        await Promise.all([
          anunciarConquistas(interaction.channelId, meuId, novasMeu, btn.client, guildId),
          anunciarConquistas(interaction.channelId, destino.id, novasDele, btn.client, guildId),
        ]);

        const moedasTxt = (quem: string, qtd: number) =>
          qtd > 0 ? `\n${emojis.moedas} + **${qtd.toLocaleString("pt-BR")}** ${nomeMoeda}` : "";

        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Troca Concluída!")
              .setColor(0x2ecc71)
              .addFields(
                {
                  name: `🎴 <@${meuId}> recebeu`,
                  value: `${emojiDele} **${deleFig.titulo}**${moedasTxt(destino.username, moedasDeles)}`,
                  inline: true,
                },
                {
                  name: `🎴 <@${destino.id}> recebeu`,
                  value: `${emojiMinha} **${minhaFig.titulo}**${moedasTxt(interaction.user.username, minhasMoedas)}`,
                  inline: true,
                },
              )
              .setFooter({ text: "Troca realizada com sucesso! Use /ver-album para ver sua coleção" })
              .setTimestamp(),
          ],
          components: [],
        });
      } catch (err) {
        logger.error({ err }, "Erro ao executar troca");
        await btn.update({ content: "❌ Erro ao executar a troca. Tente novamente.", embeds: [], components: [] });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "respondido") {
        await interaction.editReply({ content: `⏰ Proposta de troca expirou sem resposta.`, embeds: [], components: [] }).catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao propor troca");
    await interaction.editReply("❌ Erro ao processar a troca. Tente novamente.");
  }
}
