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

    // Verificar nível (nivelMaximo -1 = sem restrição)
    if (nivelMaximo >= 0) {
      const nivelRemetente = await getNivelRebirth(guildId, remetenteId);
      if (nivelRemetente > nivelMaximo) {
        const nivelNomeAtual = getNivelDisplay(emojis, nivelRemetente);
        const nivelNomeMax = getNivelDisplay(emojis, nivelMaximo);
        await interaction.editReply(
          `❌ **Doações bloqueadas para o seu nível.**\n\n` +
          `Seu nível atual é **${nivelNomeAtual}**.\n` +
          `Apenas jogadores até **${nivelNomeMax}** podem realizar doações neste servidor.`
        );
        return;
      }

      const nivelDestino = await getNivelRebirth(guildId, destino.id);
      if (nivelDestino > nivelMaximo) {
        const nivelNomeDele = getNivelDisplay(emojis, nivelDestino);
        const nivelNomeMax = getNivelDisplay(emojis, nivelMaximo);
        await interaction.editReply(
          `❌ **<@${destino.id}> não pode receber doações.**\n\n` +
          `O nível de <@${destino.id}> é **${nivelNomeDele}**.\n` +
          `Apenas jogadores até **${nivelNomeMax}** podem receber doações neste servidor.`
        );
        return;
      }
    }

    // Verificar cooldown
    const [cooldownRow] = await db
      .select({ ultimaDoacao: doacaoCooldownTable.ultimaDoacao })
      .from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)))
      .limit(1);

    if (cooldownRow) {
      const agora = Date.now();
      const ultima = cooldownRow.ultimaDoacao.getTime();
      const horasPassadas = (agora - ultima) / (1000 * 60 * 60);
      if (horasPassadas < cooldownHoras) {
        const restante = cooldownHoras - horasPassadas;
        const horas = Math.floor(restante);
        const minutos = Math.floor((restante - horas) * 60);
        const cooldownTxt = cooldownHoras % 24 === 0 ? `${cooldownHoras / 24} dias` : `${cooldownHoras}h`;
        await interaction.editReply(
          `⏳ **Cooldown de doação ativo!**\n\n` +
          `Você poderá doar novamente em **${horas}h ${minutos}min**.\n` +
          `*(Limite: 1 doação a cada ${cooldownTxt})*`
        );
        return;
      }
    }

    const [catalogoEntry] = await db.select().from(catalogoFigurinhasTable)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, numero)))
      .limit(1);

    if (!catalogoEntry) { await interaction.editReply(`❌ Não existe figurinha com o número **#${numero}** no catálogo!`); return; }

    const copiasRemetente = await db.select({ total: count() }).from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, remetenteId), eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)));

    const totalCopias = copiasRemetente[0]?.total ?? 0;
    if (totalCopias < 2) {
      if (totalCopias === 0) {
        await interaction.editReply(`❌ Você não tem a figurinha **#${numero} ${catalogoEntry.titulo}** na sua coleção!`);
      } else {
        await interaction.editReply(`❌ **Você só tem 1 cópia** da figurinha **#${numero} ${catalogoEntry.titulo}**.\n\nSó é possível doar figurinhas **repetidas** (quando você tem 2 ou mais cópias).\nUse **/repetidas** para ver quais você pode doar.`);
      }
      return;
    }

    const [minhaColecao] = await db.select({ id: colecaoUsuarioTable.id }).from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, remetenteId), eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)))
      .limit(1);

    await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, minhaColecao!.id));
    await db.insert(colecaoUsuarioTable).values({ guildId, userId: destino.id, username: destino.username, catalogoId: catalogoEntry.id });

    const [cooldownExistente] = await db.select({ id: doacaoCooldownTable.id }).from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)))
      .limit(1);

    if (cooldownExistente) {
      await db.update(doacaoCooldownTable).set({ ultimaDoacao: sql`now()` })
        .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)));
    } else {
      await db.insert(doacaoCooldownTable).values({ guildId, userId: remetenteId });
    }

    const novasConquistas = await verificarConquistas(guildId, destino.id, destino.username, {});
    if (novasConquistas.length > 0) await anunciarConquistas(interaction.channelId!, destino.id, novasConquistas, interaction.client);

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
    const mensagemErro = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Erro ao dar figurinha");
    await interaction.editReply(`❌ Erro ao transferir a figurinha.\n\`\`\`\n${mensagemErro}\n\`\`\``);
  }
}
