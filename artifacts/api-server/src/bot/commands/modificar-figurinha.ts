import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getGuildEmojis, getRaridadeEmoji } from "../lib/emoji-config.js";

const RARIDADES = ["comum", "incomum", "rara", "épica", "lendária"] as const;

export const data = new SlashCommandBuilder()
  .setName("modificar-figurinha")
  .setDescription("[ADMIN] Modifica uma figurinha existente no catálogo")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption((opt) =>
    opt.setName("numero").setDescription("Número atual da figurinha no catálogo").setRequired(true).setMinValue(1)
  )
  .addStringOption((opt) =>
    opt.setName("titulo").setDescription("Novo título da figurinha").setRequired(false).setMaxLength(80)
  )
  .addStringOption((opt) =>
    opt.setName("raridade").setDescription("Nova raridade").setRequired(false)
      .addChoices(
        { name: "⚪ Comum", value: "comum" },
        { name: "🟢 Incomum", value: "incomum" },
        { name: "🔵 Rara", value: "rara" },
        { name: "🟣 Épica", value: "épica" },
        { name: "🌟 Lendária", value: "lendária" },
      )
  )
  .addStringOption((opt) =>
    opt.setName("imagem").setDescription("Nova URL da imagem").setRequired(false).setMaxLength(500)
  )
  .addIntegerOption((opt) =>
    opt.setName("novo-numero").setDescription("Novo número para a figurinha (renumerar)").setRequired(false).setMinValue(1)
  )
  .addStringOption((opt) =>
    opt.setName("descricao").setDescription("Nova descrição (deixe em branco para manter)").setRequired(false).setMaxLength(200)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const numero = interaction.options.getInteger("numero", true);
  const novoTitulo = interaction.options.getString("titulo");
  const novaRaridade = interaction.options.getString("raridade");
  const novaImagem = interaction.options.getString("imagem");
  const novoNumero = interaction.options.getInteger("novo-numero");
  const novaDescricao = interaction.options.getString("descricao");
  const guildId = interaction.guildId!;

  if (!novoTitulo && !novaRaridade && !novaImagem && !novoNumero && novaDescricao === null) {
    await interaction.editReply("❌ Informe pelo menos um campo para modificar!"); return;
  }

  try {
    const [figurinha] = await db.select().from(catalogoFigurinhasTable)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, numero)))
      .limit(1);

    if (!figurinha) {
      await interaction.editReply(`❌ Não existe figurinha com o número **#${numero}** no catálogo!`); return;
    }

    // Verificar se novo número já está em uso
    if (novoNumero && novoNumero !== numero) {
      const [conflito] = await db.select({ id: catalogoFigurinhasTable.id }).from(catalogoFigurinhasTable)
        .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, novoNumero)))
        .limit(1);
      if (conflito) {
        await interaction.editReply(`❌ O número **#${novoNumero}** já está sendo usado por outra figurinha!`); return;
      }
    }

    // Validar URL de imagem
    if (novaImagem) {
      try { new URL(novaImagem); } catch {
        await interaction.editReply("❌ A URL da imagem é inválida!"); return;
      }
    }

    const updates: Partial<typeof catalogoFigurinhasTable.$inferInsert> = {};
    if (novoTitulo) updates.titulo = novoTitulo;
    if (novaRaridade) updates.raridade = novaRaridade;
    if (novaImagem) updates.imageUrl = novaImagem;
    if (novoNumero) updates.numero = novoNumero;
    if (novaDescricao !== null) updates.descricao = novaDescricao || undefined;

    await db.update(catalogoFigurinhasTable)
      .set(updates)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, numero)));

    const [atualizada] = await db.select().from(catalogoFigurinhasTable)
      .where(and(eq(catalogoFigurinhasTable.guildId, guildId), eq(catalogoFigurinhasTable.numero, novoNumero ?? numero)))
      .limit(1);

    const emojis = await getGuildEmojis(guildId);
    const emoji = getRaridadeEmoji(emojis, atualizada!.raridade);

    const alteracoes: string[] = [];
    if (novoTitulo) alteracoes.push(`📝 Título: **${figurinha.titulo}** → **${novoTitulo}**`);
    if (novaRaridade) alteracoes.push(`✨ Raridade: **${figurinha.raridade}** → **${novaRaridade}**`);
    if (novaImagem) alteracoes.push(`🖼️ Imagem: atualizada`);
    if (novoNumero) alteracoes.push(`🔢 Número: **#${numero}** → **#${novoNumero}**`);
    if (novaDescricao !== null) alteracoes.push(`📄 Descrição: atualizada`);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Figurinha modificada!`)
      .setDescription(
        `${emoji} **#${atualizada!.numero} — ${atualizada!.titulo}** foi atualizada!\n\n` +
        alteracoes.join("\n")
      )
      .setImage(atualizada!.imageUrl)
      .setColor(0x2b7a0b)
      .setFooter({ text: `Modificado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao modificar figurinha");
    await interaction.editReply("❌ Erro ao modificar a figurinha. Tente novamente.");
  }
}
