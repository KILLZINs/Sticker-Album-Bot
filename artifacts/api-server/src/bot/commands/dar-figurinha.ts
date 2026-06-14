import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable, doacaoCooldownTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { verificarConquistas, anunciarConquistas } from "../lib/conquistas.js";
import { getGuildEmojis, getRaridadeEmoji, getNivelDisplay } from "../lib/emoji-config.js";
import { getNivelRebirth } from "../lib/moedas.js";
import { getGuildFigurinhaConfig } from "../lib/figurinha-config.js";

export const data = new SlashCommandBuilder()
  .setName("dar-figurinha")
  .setDescription("Dá uma cópia repetida de uma figurinha sua para outro usuário")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Para quem você quer dar a figurinha").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo (use /repetidas para ver as suas cópias)")
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const destino = interaction.options.getUser("usuario", true);
  const numero = interaction.options.getInteger("numero", true);
  const guildId = interaction.guildId!;
  const remetenteId = interaction.user.id;
  const remetenteUsername = interaction.user.username;

  if (destino.id === remetenteId) { await interaction.editReply("❌ Você não pode dar uma figurinha para você mesmo!"); return; }
  if (destino.bot) { await interaction.editReply("❌ Você não pode dar figurinhas para bots!"); return; }

  try {
    const [emojis, figCfg] = await Promise.all([
      getGuildEmojis(guildId),
      getGuildFigurinhaConfig(guildId),
    ]);

    const cooldownHoras = figCfg.cooldownDoacaoHoras;
    const nivelMaximo = figCfg.nivelMaximoDoacao;

    if (nivelMaximo >= 0) {
      const nivelRemetente = await getNivelRebirth(guildId, remetenteId);
      if (nivelRemetente > nivelMaximo) {
        await interaction.editReply(
          `❌ **Doações bloqueadas para o seu nível.**\n\nSeu nível: **${getNivelDisplay(emojis, nivelRemetente)}**\nMáximo permitido: **${getNivelDisplay(emojis, nivelMaximo)}**`
        );
        return;
      }
      const nivelDestino = await getNivelRebirth(guildId, destino.id);
      if (nivelDestino > nivelMaximo) {
        await interaction.editReply(
          `❌ **<@${destino.id}> não pode receber doações.**\nNível dele: **${getNivelDisplay(emojis, nivelDestino)}** · Máximo: **${getNivelDisplay(emojis, nivelMaximo)}**`
        );
        return;
      }
    }

    const [cooldownRow] = await db
      .select({ ultimaDoacao: doacaoCooldownTable.ultimaDoacao })
      .from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)))
      .limit(1);

    if (cooldownRow) {
      const horasPassadas = (Date.now() - cooldownRow.ultimaDoacao.getTime()) / 3_600_000;
      if (horasPassadas < cooldownHoras) {
        const restante = cooldownHoras - horasPassadas;
        const horas = Math.floor(restante);
        const minutos = Math.floor((restante - horas) * 60);
        const cooldownTxt = cooldownHoras % 24 === 0 ? `${cooldownHoras / 24} dias` : `${cooldownHoras}h`;
        await interaction.editReply(`⏳ **Cooldown de doação ativo!**\n\nPode doar novamente em **${horas}h ${minutos}min**.\n*(Limite: 1 doação a cada ${cooldownTxt})*`);
        return;
      }
    }

    const [catalogoEntry] = await db.select().from(catalogoFigurinhasTable)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, numero))).limit(1);

    if (!catalogoEntry) { await interaction.editReply(`❌ Não existe figurinha com o número **#${numero}** no catálogo!`); return; }

    const [{ total: totalCopias }] = await db.select({ total: count() }).from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, remetenteId), eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)));

    if (totalCopias < 2) {
      await interaction.editReply(
        totalCopias === 0
          ? `❌ Você não tem a figurinha **#${numero} ${catalogoEntry.titulo}** na sua coleção!`
          : `❌ Você só tem **1 cópia** de **#${numero} ${catalogoEntry.titulo}**.\nSó é possível doar figurinhas repetidas (2+ cópias). Use **/repetidas** para ver as suas.`
      );
      return;
    }

    const [primeiraCopia] = await db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, remetenteId), eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id))).limit(1);

    await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, primeiraCopia!.id));
    await db.insert(colecaoUsuarioTable).values({ guildId, userId: destino.id, username: destino.username, catalogoId: catalogoEntry.id });

    // Atualizar cooldown
    const [cooldownExistente] = await db.select({ id: doacaoCooldownTable.id }).from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId))).limit(1);
    if (cooldownExistente) {
      await db.update(doacaoCooldownTable).set({ ultimaDoacao: sql`now()` })
        .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)));
    } else {
      await db.insert(doacaoCooldownTable).values({ guildId, userId: remetenteId });
    }

    const novasConquistas = await verificarConquistas(guildId, destino.id, destino.username, {});
    if (novasConquistas.length > 0) {
      await anunciarConquistas(interaction.channelId!, destino.id, novasConquistas, interaction.client, guildId);
    }

    const emoji = getRaridadeEmoji(emojis, catalogoEntry.raridade);
    const copiasRestantes = totalCopias - 1;
    const cooldownTxt = cooldownHoras % 24 === 0 ? `${cooldownHoras / 24} dias` : `${cooldownHoras}h`;

    const embed = new EmbedBuilder()
      .setTitle("🎁 Figurinha doada!")
      .setDescription(`<@${remetenteId}> deu a figurinha **${emoji} ${catalogoEntry.titulo}** para <@${destino.id}>!`)
      .setImage(catalogoEntry.imageUrl)
      .setColor(0x9B59B6)
      .addFields(
        { name: "🎴 Figurinha", value: `#${catalogoEntry.numero} ${catalogoEntry.titulo}`, inline: true },
        { name: "✨ Raridade", value: `${emoji} ${catalogoEntry.raridade}`, inline: true },
        { name: "📋 Cópias restantes", value: `${copiasRestantes} cópia${copiasRestantes !== 1 ? "s" : ""}`, inline: true },
      )
      .setFooter({ text: `De ${remetenteUsername} para ${destino.username} • Próxima doação em ${cooldownTxt}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao dar figurinha");
    await interaction.editReply(`❌ Erro ao transferir a figurinha.\n\`\`\`\n${err instanceof Error ? err.message : String(err)}\n\`\`\``);
  }
}
