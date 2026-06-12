import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { figurinhasTable, albumsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

const RARIDADES = ["comum", "incomum", "rara", "épica", "lendária"];

export const data = new SlashCommandBuilder()
  .setName("adicionar-figurinha")
  .setDescription("Adiciona uma figurinha ao seu álbum com uma foto")
  .addAttachmentOption((opt) =>
    opt
      .setName("foto")
      .setDescription("A foto da figurinha")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("titulo")
      .setDescription("Título da figurinha")
      .setRequired(true)
      .setMaxLength(50)
  )
  .addStringOption((opt) =>
    opt
      .setName("raridade")
      .setDescription("Raridade da figurinha")
      .setRequired(false)
      .addChoices(
        { name: "⚪ Comum", value: "comum" },
        { name: "🟢 Incomum", value: "incomum" },
        { name: "🔵 Rara", value: "rara" },
        { name: "🟣 Épica", value: "épica" },
        { name: "🌟 Lendária", value: "lendária" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("descricao")
      .setDescription("Descrição da figurinha")
      .setRequired(false)
      .setMaxLength(100)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const foto = interaction.options.getAttachment("foto", true);
  const titulo = interaction.options.getString("titulo", true);
  const raridade = interaction.options.getString("raridade") ?? "comum";
  const descricao = interaction.options.getString("descricao");

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (!foto.contentType?.startsWith("image/")) {
    await interaction.editReply("❌ O arquivo enviado precisa ser uma imagem!");
    return;
  }

  try {
    const emojis = await getGuildEmojis(guildId);

    // Upsert do álbum
    const albumExistente = await db
      .select()
      .from(albumsTable)
      .where(and(eq(albumsTable.guildId, guildId), eq(albumsTable.userId, userId)))
      .limit(1);

    const totalResult = await db
      .select({ total: count() })
      .from(figurinhasTable)
      .where(and(eq(figurinhasTable.guildId, guildId), eq(figurinhasTable.ownerId, userId)));

    const total = totalResult[0]?.total ?? 0;
    const numero = total + 1;

    const repetidaResult = await db
      .select()
      .from(figurinhasTable)
      .where(
        and(
          eq(figurinhasTable.guildId, guildId),
          eq(figurinhasTable.ownerId, userId),
          eq(figurinhasTable.titulo, titulo)
        )
      )
      .limit(1);

    const repetida = repetidaResult.length > 0;

    const [figurinha] = await db
      .insert(figurinhasTable)
      .values({
        guildId,
        ownerId: userId,
        ownerUsername: username,
        imageUrl: foto.url,
        titulo,
        descricao: descricao ?? null,
        raridade,
        numero,
        repetida,
      })
      .returning();

    if (albumExistente.length === 0) {
      await db.insert(albumsTable).values({
        guildId,
        userId,
        username,
        totalFigurinhas: 1,
      });
    } else {
      await db
        .update(albumsTable)
        .set({
          totalFigurinhas: albumExistente[0]!.totalFigurinhas + 1,
          atualizadoEm: new Date(),
        })
        .where(and(eq(albumsTable.guildId, guildId), eq(albumsTable.userId, userId)));
    }

    const emoji = getRaridadeEmoji(emojis, raridade);
    const repetidaMsg = repetida ? "\n⚠️ **Figurinha repetida!**" : "";

    await interaction.editReply({
      content: `✅ Figurinha **#${numero}** adicionada ao álbum!${repetidaMsg}`,
      embeds: [
        {
          title: `${emoji} ${titulo}`,
          description: descricao ?? undefined,
          image: { url: foto.url },
          color: getRaridadeColor(raridade),
          fields: [
            { name: "Raridade", value: `${emoji} ${raridade.charAt(0).toUpperCase() + raridade.slice(1)}`, inline: true },
            { name: "Número", value: `#${numero}`, inline: true },
            { name: "Dono", value: `<@${userId}>`, inline: true },
          ],
          footer: { text: `Álbum de ${username}` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (err) {
    logger.error({ err }, "Erro ao adicionar figurinha");
    await interaction.editReply("❌ Erro ao adicionar a figurinha. Tente novamente.");
  }
}

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum": return 0x57f287;
    case "rara": return 0x5865f2;
    case "épica": return 0x9b59b6;
    case "lendária": return 0xf1c40f;
    default: return 0x99aab5;
  }
}
