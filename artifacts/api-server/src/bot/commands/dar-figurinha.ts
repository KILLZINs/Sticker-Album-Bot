import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { figurinhasTable, albumsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("dar-figurinha")
  .setDescription("Dá uma das suas figurinhas para outro usuário")
  .addUserOption((opt) =>
    opt
      .setName("usuario")
      .setDescription("Para quem você quer dar a figurinha")
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha que você quer dar")
      .setRequired(true)
      .setMinValue(1)
  );

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

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
    // Buscar a figurinha do remetente
    const [figurinha] = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, remetenteId),
          eq(figurinhasTable.numero, numero)
        )
      )
      .limit(1);

    if (!figurinha) {
      await interaction.editReply(`❌ Você não tem uma figurinha com o número **#${numero}**!`);
      return;
    }

    // Verificar se o destinatário já tem a mesma figurinha (pelo título)
    const [destinatarioTemRepetida] = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, destino.id),
          eq(figurinhasTable.titulo, figurinha.titulo)
        )
      )
      .limit(1);

    // Contar figurinhas do destinatário para novo número
    const destinatarioFigurinhas = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, destino.id)
        )
      );

    const novoNumero = destinatarioFigurinhas.length + 1;
    const seraRepetida = !!destinatarioTemRepetida;

    // Transferir: atualizar dono da figurinha
    await db
      .update(figurinhasTable)
      .set({
        ownerId: destino.id,
        ownerUsername: destino.username,
        numero: novoNumero,
        repetida: seraRepetida,
      })
      .where(eq(figurinhasTable.id, figurinha.id));

    // Atualizar álbum do remetente
    const albumRemetente = await db
      .select()
      .from(albumsTable)
      .where(
        and(
          eq(albumsTable.guildId, guildId),
          eq(albumsTable.userId, remetenteId)
        )
      )
      .limit(1);

    if (albumRemetente[0]) {
      await db
        .update(albumsTable)
        .set({
          totalFigurinhas: Math.max(0, albumRemetente[0].totalFigurinhas - 1),
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(albumsTable.guildId, guildId),
            eq(albumsTable.userId, remetenteId)
          )
        );
    }

    // Upsert álbum do destinatário
    const albumDestino = await db
      .select()
      .from(albumsTable)
      .where(
        and(
          eq(albumsTable.guildId, guildId),
          eq(albumsTable.userId, destino.id)
        )
      )
      .limit(1);

    if (albumDestino[0]) {
      await db
        .update(albumsTable)
        .set({
          totalFigurinhas: albumDestino[0].totalFigurinhas + 1,
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(albumsTable.guildId, guildId),
            eq(albumsTable.userId, destino.id)
          )
        );
    } else {
      await db.insert(albumsTable).values({
        guildId,
        userId: destino.id,
        username: destino.username,
        totalFigurinhas: 1,
      });
    }

    const emoji = RARIDADE_EMOJI[figurinha.raridade] ?? "⚪";

    const embed = new EmbedBuilder()
      .setTitle("🎁 Figurinha transferida!")
      .setDescription(
        `<@${remetenteId}> deu a figurinha **${emoji} ${figurinha.titulo}** para <@${destino.id}>!`
      )
      .setImage(figurinha.imageUrl)
      .setColor(0x57f287)
      .addFields(
        { name: "Raridade", value: `${emoji} ${figurinha.raridade}`, inline: true },
        { name: "Número novo", value: `#${novoNumero}`, inline: true },
        { name: "Repetida", value: seraRepetida ? "⚠️ Sim" : "✅ Não", inline: true }
      )
      .setFooter({ text: `De ${remetenteUsername} para ${destino.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao dar figurinha");
    await interaction.editReply("❌ Erro ao transferir a figurinha. Tente novamente.");
  }
}
