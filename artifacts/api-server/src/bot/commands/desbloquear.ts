import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable, colecaoUsuarioTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

export const data = new SlashCommandBuilder()
  .setName("desbloquear-figurinha")
  .setDescription("(Admin) Desbloqueia uma figurinha do catálogo diretamente para um usuário")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Usuário que vai receber a figurinha").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("numero")
      .setDescription("Número da figurinha no catálogo")
      .setRequired(false)
      .setMinValue(1)
  )
  .addStringOption((opt) =>
    opt
      .setName("busca")
      .setDescription("Buscar figurinha pelo nome")
      .setRequired(false)
      .setMaxLength(50)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const alvo = interaction.options.getUser("usuario", true);
  const numero = interaction.options.getInteger("numero");
  const busca = interaction.options.getString("busca");
  const guildId = interaction.guildId!;

  if (!numero && !busca) {
    await interaction.editReply("❌ Informe o **número** ou o **nome** da figurinha!");
    return;
  }

  if (alvo.bot) {
    await interaction.editReply("❌ Não é possível dar figurinhas para bots!");
    return;
  }

  try {
    let figurinha = null;

    if (numero) {
      const [found] = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, numero)))
        .limit(1);
      figurinha = found ?? null;
    } else if (busca) {
      const results = await db
        .select()
        .from(catalogoFigurinhasTable)
        .where(and(eq(catalogoFigurinhasTable.guildId, guildId), ilike(catalogoFigurinhasTable.titulo, `%${busca}%`)))
        .limit(5);

      if (results.length === 0) {
        await interaction.editReply(`🔍 Nenhuma figurinha com o nome **"${busca}"** encontrada.`);
        return;
      }
      if (results.length > 1) {
        const lista = results.map((f) => `**#${f.numero}** ${f.titulo}`).join("\n");
        await interaction.editReply(`🔍 Múltiplos resultados:\n${lista}\n\nUse o **número** para ser mais específico.`);
        return;
      }
      figurinha = results[0]!;
    }

    if (!figurinha) {
      await interaction.editReply(`❌ Figurinha não encontrada no catálogo!`);
      return;
    }

    const [jaTem] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, alvo.id),
          eq(colecaoUsuarioTable.catalogoId, figurinha.id)
        )
      )
      .limit(1);

    if (jaTem) {
      await interaction.editReply(`⚠️ <@${alvo.id}> já tem a figurinha **${figurinha.titulo}**!`);
      return;
    }

    await db.insert(colecaoUsuarioTable).values({
      guildId,
      userId: alvo.id,
      username: alvo.username,
      catalogoId: figurinha.id,
    });

    const emoji = RARIDADE_EMOJI[figurinha.raridade] ?? "⚪";
    await interaction.editReply(
      `✅ Figurinha **${emoji} ${figurinha.titulo}** desbloqueada para <@${alvo.id}>!`
    );

    await interaction.followUp({
      ephemeral: false,
      embeds: [
        new EmbedBuilder()
          .setTitle(`🎁 Figurinha concedida por um admin!`)
          .setDescription(`<@${alvo.id}> recebeu a figurinha **${emoji} ${figurinha.titulo}**!`)
          .setImage(figurinha.imageUrl)
          .setColor(getRaridadeColor(figurinha.raridade))
          .setFooter({ text: `Concedida por ${interaction.user.username}` })
          .setTimestamp(),
      ],
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      await interaction.editReply("⚠️ Esse usuário já tem essa figurinha!");
      return;
    }
    logger.error({ err }, "Erro ao desbloquear figurinha (admin)");
    await interaction.editReply("❌ Erro ao desbloquear. Tente novamente.");
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
