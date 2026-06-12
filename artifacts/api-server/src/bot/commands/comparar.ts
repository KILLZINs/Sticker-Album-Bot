import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

export const data = new SlashCommandBuilder()
  .setName("comparar")
  .setDescription("Compara sua coleção com a de outro usuário — veja o que cada um tem ou falta");

data.addUserOption((opt) =>
  opt.setName("usuario").setDescription("Usuário para comparar").setRequired(true)
);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvo = interaction.options.getUser("usuario", true);
  const guildId = interaction.guildId!;
  const meId = interaction.user.id;
  const aId = alvo.id;

  if (aId === meId) {
    await interaction.editReply("❌ Você não pode se comparar com você mesmo!");
    return;
  }
  if (alvo.bot) {
    await interaction.editReply("❌ Não é possível comparar com um bot!");
    return;
  }

  try {
    const emojis = await getGuildEmojis(guildId);

    const [minhaCol, aCol, totalCatResult] = await Promise.all([
      db
        .select({
          catalogoId: colecaoUsuarioTable.catalogoId,
          numero: catalogoFigurinhasTable.numero,
          titulo: catalogoFigurinhasTable.titulo,
          raridade: catalogoFigurinhasTable.raridade,
        })
        .from(colecaoUsuarioTable)
        .innerJoin(catalogoFigurinhasTable, eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id))
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, meId)))
        .orderBy(catalogoFigurinhasTable.numero),

      db
        .select({
          catalogoId: colecaoUsuarioTable.catalogoId,
          numero: catalogoFigurinhasTable.numero,
          titulo: catalogoFigurinhasTable.titulo,
          raridade: catalogoFigurinhasTable.raridade,
        })
        .from(colecaoUsuarioTable)
        .innerJoin(catalogoFigurinhasTable, eq(colecaoUsuarioTable.catalogoId, catalogoFigurinhasTable.id))
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, aId)))
        .orderBy(catalogoFigurinhasTable.numero),

      db
        .select({ total: countDistinct(catalogoFigurinhasTable.id) })
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId)),
    ]);

    // Deduplica — usuário pode ter múltiplas cópias da mesma figurinha
    type FigInfo = { catalogoId: number; numero: number; titulo: string; raridade: string };
    const minhaSet = new Map<number, FigInfo>();
    for (const f of minhaCol) minhaSet.set(f.catalogoId, f);

    const aSet = new Map<number, FigInfo>();
    for (const f of aCol) aSet.set(f.catalogoId, f);

    const soMinha = [...minhaSet.values()].filter((f) => !aSet.has(f.catalogoId));
    const soA = [...aSet.values()].filter((f) => !minhaSet.has(f.catalogoId));
    const ambos = [...minhaSet.values()].filter((f) => aSet.has(f.catalogoId));

    const totalCat = totalCatResult[0]?.total ?? 0;
    const minhasUnicas = minhaSet.size;
    const aUnicas = aSet.size;

    const pctMe = totalCat > 0 ? Math.round((minhasUnicas / totalCat) * 100) : 0;
    const pctA = totalCat > 0 ? Math.round((aUnicas / totalCat) * 100) : 0;

    const fmt = (items: FigInfo[], max = 12): string => {
      if (items.length === 0) return "_Nenhuma_";
      const lines = items.slice(0, max).map((f) => {
        const e = getRaridadeEmoji(emojis, f.raridade);
        return `${e} **#${f.numero}** ${f.titulo}`;
      });
      if (items.length > max) lines.push(`_...e mais ${items.length - max}_`);
      return lines.join("\n");
    };

    const embed = new EmbedBuilder()
      .setTitle("📊 Comparação de Coleções")
      .setColor(0x5865f2)
      .setDescription(
        `**${interaction.user.username}** vs **${alvo.username}**\n` +
        (totalCat > 0 ? `📚 Catálogo: **${totalCat}** figurinhas no total` : "")
      )
      .addFields(
        {
          name: `🔵 ${interaction.user.username}`,
          value: `**${minhasUnicas}** únicas — ${pctMe}% do catálogo`,
          inline: true,
        },
        {
          name: `🔴 ${alvo.username}`,
          value: `**${aUnicas}** únicas — ${pctA}% do catálogo`,
          inline: true,
        },
        {
          name: "🟢 Em comum",
          value: `**${ambos.length}** figurinha${ambos.length !== 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: `🔵 Só você tem (${soMinha.length}) — ${alvo.username} precisa destas`,
          value: fmt(soMinha),
          inline: false,
        },
        {
          name: `🔴 Só ${alvo.username} tem (${soA.length}) — você precisa destas`,
          value: fmt(soA),
          inline: false,
        },
      )
      .setFooter({ text: "Use /dar-figurinha para trocar repetidas com este usuário" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao comparar coleções");
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`❌ Erro ao comparar coleções.\n\`\`\`\n${msg}\n\`\`\``);
  }
}
