import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { verificarConquistas, anunciarConquistas } from "../lib/conquistas.js";

// RARIDADE_EMOJI
const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

export const data = new SlashCommandBuilder()
  .setName("dar-figurinha")
  .setDescription("Dá uma cópia de uma figurinha sua para outro usuário")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Para quem você quer dar a figurinha")
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo (use /catalogo para ver)")
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
    // Buscar a figurinha no catálogo pelo número
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

    // Verificar se o remetente tem pelo menos uma cópia
    const [minhaColecao] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, remetenteId),
          eq(colecaoUsuarioTable.catalogoId, catalogoEntry.id)
        )
      )
      .limit(1);

    if (!minhaColecao) {
      await interaction.editReply(
        `❌ Você não tem a figurinha **#${numero} ${catalogoEntry.titulo}** na sua coleção!`
      );
      return;
    }

    // Remover UMA cópia do remetente e dar ao destinatário
    await db
      .delete(colecaoUsuarioTable)
      .where(eq(colecaoUsuarioTable.id, minhaColecao.id));

    await db.insert(colecaoUsuarioTable).values({
      guildId,
      userId: destino.id,
      username: destino.username,
      catalogoId: catalogoEntry.id,
    });

    // Verificar conquistas do destinatário
    const novasConquistas = await verificarConquistas(guildId, destino.id, destino.username, {});
    if (novasConquistas.length > 0) {
      await anunciarConquistas(interaction.channelId!, destino.id, novasConquistas, interaction.client);
    }

    const emoji = RARIDADE_EMOJI[catalogoEntry.raridade] ?? "⚪";

    const embed = new EmbedBuilder()
      .setTitle("🎁 Figurinha transferida!")
      .setDescription(
        `<@${remetenteId}> deu a figurinha **${emoji} ${catalogoEntry.titulo}** para <@${destino.id}>!`
      )
      .setImage(catalogoEntry.imageUrl)
      .setColor(0x9B59B6)
      .addFields(
        { name: "🎴 Figurinha", value: `#${catalogoEntry.numero} ${catalogoEntry.titulo}`, inline: true },
        { name: "✨ Raridade", value: `${emoji} ${catalogoEntry.raridade}`, inline: true },
      )
      .setFooter({ text: `De ${remetenteUsername} para ${destino.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao dar figurinha");
    await interaction.editReply("❌ Erro ao transferir a figurinha. Tente novamente.");
  }
}
