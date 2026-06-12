import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

export const data = new SlashCommandBuilder()
  .setName("criar-figurinha")
  .setDescription("(Admin) Adiciona uma nova figurinha ao catálogo do servidor")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addAttachmentOption((opt) =>
    opt.setName("foto").setDescription("A imagem da figurinha").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("titulo").setDescription("Título da figurinha").setRequired(true).setMaxLength(50)
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
    opt.setName("descricao").setDescription("Descrição da figurinha").setRequired(false).setMaxLength(150)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const foto = interaction.options.getAttachment("foto", true);
  const titulo = interaction.options.getString("titulo", true);
  const raridade = interaction.options.getString("raridade") ?? "comum";
  const descricao = interaction.options.getString("descricao");
  const guildId = interaction.guildId!;

  if (!foto.contentType?.startsWith("image/")) {
    await interaction.editReply("❌ O arquivo precisa ser uma imagem!");
    return;
  }

  try {
    const emojis = await getGuildEmojis(guildId);

    const [existente] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.titulo, titulo)))
      .limit(1);

    if (existente) {
      await interaction.editReply(
        `❌ Já existe uma figurinha chamada **"${titulo}"** no catálogo (nº ${existente.numero})!`
      );
      return;
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    const numero = (total ?? 0) + 1;

    await db
      .insert(catalogoFigurinhasTable)
      .values({
        guildId,
        criadoPorId: interaction.user.id,
        criadoPorUsername: interaction.user.username,
        imageUrl: foto.url,
        titulo,
        descricao: descricao ?? null,
        raridade,
        numero,
      })
      .returning();

    const emoji = getRaridadeEmoji(emojis, raridade);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Figurinha #${numero} adicionada ao catálogo!`)
      .setDescription(descricao ?? "Sem descrição")
      .setImage(foto.url)
      .setColor(getRaridadeColor(raridade))
      .addFields(
        { name: "Título", value: titulo, inline: true },
        { name: "Raridade", value: `${emoji} ${raridade}`, inline: true },
        { name: "Número no catálogo", value: `#${numero}`, inline: true }
      )
      .setFooter({ text: `Criada por ${interaction.user.username} • Os usuários já podem desbloquear esta figurinha!` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    await interaction.followUp({
      ephemeral: false,
      content: `📢 Nova figurinha **${emoji} ${titulo}** (${raridade}) foi adicionada ao catálogo! Use **/desbloquear-figurinha** para adicioná-la ao seu álbum.`,
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emoji} ${titulo}`)
          .setDescription(descricao ?? "Sem descrição")
          .setImage(foto.url)
          .setColor(getRaridadeColor(raridade))
          .setFooter({ text: `Figurinha #${numero} do catálogo` }),
      ],
    });
  } catch (err) {
    logger.error({ err }, "Erro ao criar figurinha no catálogo");
    await interaction.editReply("❌ Erro ao adicionar ao catálogo. Tente novamente.");
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
