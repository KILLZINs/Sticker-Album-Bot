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
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";
import { getNivelRebirth } from "../lib/moedas.js";

const COOLDOWN_DIAS = 3;
const NIVEL_MAXIMO_DOACAO = 0;

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

  if (destino.id === remetenteId) {
    await interaction.editReply("❌ Você não pode dar uma figurinha para você mesmo!");
    return;
  }

  if (destino.bot) {
    await interaction.editReply("❌ Você não pode dar figurinhas para bots!");
    return;
  }

  try {
    const emojis = await getGuildEmojis(guildId);

    const nivelRemetente = await getNivelRebirth(guildId, remetenteId);
    if (nivelRemetente > NIVEL_MAXIMO_DOACAO) {
      await interaction.editReply(
        "❌ **Doações bloqueadas para o seu nível.**\n\n" +
        "Apenas jogadores no nível **✨ Normal** podem dar figurinhas.\n" +
        "Jogadores em 🥈 Prata ou 🥇 Ouro não podem participar de doações."
      );
      return;
    }

    const nivelDestino = await getNivelRebirth(guildId, destino.id);
    if (nivelDestino > NIVEL_MAXIMO_DOACAO) {
      await interaction.editReply(
        `❌ **<@${destino.id}> não pode receber doações.**\n\n` +
        "Apenas jogadores no nível **✨ Normal** podem receber figurinhas.\n" +
        "Jogadores em 🥈 Prata ou 🥇 Ouro não participam de doações."
      );
      return;
    }

    const [cooldownRow] = await db
      .select({ ultimaDoacao: doacaoCooldownTable.ultimaDoacao })
      .from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)))
      .limit(1);

    if (cooldownRow) {
      const agora = Date.now();
      const ultima = cooldownRow.ultimaDoacao.getTime();
      const diasPassados = (agora - ultima) / (1000 * 60 * 60 * 24);

      if (diasPassados < COOLDOWN_DIAS) {
        const restante = COOLDOWN_DIAS - diasPassados;
        const horas = Math.floor(restante * 24);
        const minutos = Math.floor((restante * 24 - horas) * 60);
        await interaction.editReply(
          `⏳ **Cooldown de doação ativo!**\n\n` +
          `Você poderá doar novamente em **${horas}h ${minutos}min**.\n` +
          `*(Limite: 1 doação a cada ${COOLDOWN_DIAS} dias)*`
        );
        return;
      }
    }

    const [catalogoEntry] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, numero)
        )
      )
      .limit(1);

    if (!catalogoEntry) {
      await interaction.editReply(`❌ Não existe figurinha com o número **#${numero}** no catálogo!`);
      return;
    }

    const copiasRemetente = await db
      .select({ total: count() })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, remetenteId),
          eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)
        )
      );

    const totalCopias = copiasRemetente[0]?.total ?? 0;

    if (totalCopias < 2) {
      if (totalCopias === 0) {
        await interaction.editReply(
          `❌ Você não tem a figurinha **#${numero} ${catalogoEntry.titulo}** na sua coleção!`
        );
      } else {
        await interaction.editReply(
          `❌ **Você só tem 1 cópia** da figurinha **#${numero} ${catalogoEntry.titulo}**.\n\n` +
          `Só é possível doar figurinhas **repetidas** (quando você tem 2 ou mais cópias).\n` +
          `Use **/repetidas** para ver quais figurinhas você pode doar.`
        );
      }
      return;
    }

    const [minhaColecao] = await db
      .select({ id: colecaoUsuarioTable.id })
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, remetenteId),
          eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)
        )
      )
      .limit(1);

    await db.delete(colecaoUsuarioTable).where(eq(colecaoUsuarioTable.id, minhaColecao!.id));
    await db.insert(colecaoUsuarioTable).values({
      guildId,
      userId: destino.id,
      username: destino.username,
      catalogoId: catalogoEntry.id,
    });

    // Atualizar cooldown — SELECT explícito para não depender de constraint no banco
    const [cooldownExistente] = await db
      .select({ id: doacaoCooldownTable.id })
      .from(doacaoCooldownTable)
      .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)))
      .limit(1);

    if (cooldownExistente) {
      await db
        .update(doacaoCooldownTable)
        .set({ ultimaDoacao: sql`now()` })
        .where(and(eq(doacaoCooldownTable.guildId, guildId), eq(doacaoCooldownTable.userId, remetenteId)));
    } else {
      await db.insert(doacaoCooldownTable).values({ guildId, userId: remetenteId });
    }

    const novasConquistas = await verificarConquistas(guildId, destino.id, destino.username, {});
    if (novasConquistas.length > 0) {
      await anunciarConquistas(interaction.channelId!, destino.id, novasConquistas, interaction.client);
    }

    const emoji = getRaridadeEmoji(emojis, catalogoEntry.raridade);
    const copiasRestantes = totalCopias - 1;

    const embed = new EmbedBuilder()
      .setTitle("🎁 Figurinha doada!")
      .setDescription(
        `<@${remetenteId}> deu a figurinha **${emoji} ${catalogoEntry.titulo}** para <@${destino.id}>!`
      )
      .setImage(catalogoEntry.imageUrl)
      .setColor(0x9B59B6)
      .addFields(
        { name: "🎴 Figurinha", value: `#${catalogoEntry.numero} ${catalogoEntry.titulo}`, inline: true },
        { name: "✨ Raridade", value: `${emoji} ${catalogoEntry.raridade}`, inline: true },
        { name: "📋 Cópias restantes", value: `${copiasRestantes} cópia${copiasRestantes !== 1 ? "s" : ""}`, inline: true },
      )
      .setFooter({ text: `De ${remetenteUsername} para ${destino.username} • Próxima doação em ${COOLDOWN_DIAS} dias` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Erro ao dar figurinha");
    await interaction.editReply(`❌ Erro ao transferir a figurinha.\n\`\`\`\n${mensagemErro}\n\`\`\``);
  }
}
