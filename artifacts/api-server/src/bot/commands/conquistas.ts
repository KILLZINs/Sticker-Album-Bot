import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { conquistasUsuarioTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CONQUISTAS } from "../lib/conquistas.js";
import { logger } from "../lib/logger.js";

export const data = new SlashCommandBuilder()
  .setName("conquistas")
  .setDescription("Veja suas conquistas desbloqueadas")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Ver conquistas de outro usuário").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alvoUser = interaction.options.getUser("usuario") ?? interaction.user;
  const guildId = interaction.guildId!;
  const isSelf = alvoUser.id === interaction.user.id;

  try {
    const desbloqueadas = await db
      .select()
      .from(conquistasUsuarioTable)
      .where(
        and(
          eq(conquistasUsuarioTable.guildId, guildId),
          eq(conquistasUsuarioTable.userId, alvoUser.id)
        )
      )
      .orderBy(conquistasUsuarioTable.ganhoEm);

    // Filtrar apenas conquistas reais (ignorar contadores internos tipo troca_realizada_*)
    const conquistasReais = desbloqueadas.filter((c) => CONQUISTAS[c.conquistaId]);

    const totalPossiveis = Object.keys(CONQUISTAS).length;
    const totalDesbloqueadas = conquistasReais.length;

    // Montar linhas de desbloqueadas
    const linhasDesbloqueadas = conquistasReais.map((c) => {
      const info = CONQUISTAS[c.conquistaId]!;
      const data = c.ganhoEm.toLocaleDateString("pt-BR");
      return `${info.emoji} **${info.nome}** — *${info.descricao}* (${data})`;
    });

    // Montar linhas de bloqueadas
    const idsDesbloqueados = new Set(conquistasReais.map((c) => c.conquistaId));
    const bloqueadas = Object.values(CONQUISTAS).filter((c) => !idsDesbloqueados.has(c.id));
    const linhasBloqueadas = bloqueadas.map((c) => `🔒 ~~${c.nome}~~`);

    const progresso = Math.round((totalDesbloqueadas / totalPossiveis) * 100);
    const barraLen = 18;
    const preenchido = Math.round((progresso / 100) * barraLen);
    const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 Conquistas de ${alvoUser.username}`)
      .setColor(0x470f78)
      .setThumbnail(alvoUser.displayAvatarURL())
      .setDescription(
        `**Progresso:** ${totalDesbloqueadas}/${totalPossiveis} (${progresso}%)\n\`${barra}\``
      );

    if (linhasDesbloqueadas.length > 0) {
      embed.addFields({
        name: `✅ Desbloqueadas (${totalDesbloqueadas})`,
        value: linhasDesbloqueadas.join("\n"),
        inline: false,
      });
    }

    if (linhasBloqueadas.length > 0) {
      embed.addFields({
        name: `🔒 Bloqueadas (${bloqueadas.length})`,
        value: linhasBloqueadas.join("\n"),
        inline: false,
      });
    }

    if (totalDesbloqueadas === 0) {
      embed.setDescription(
        `📭 ${isSelf ? "Você ainda não tem" : `<@${alvoUser.id}> ainda não tem`} nenhuma conquista!\n\nAbra pacotinhos e colecione figurinhas para desbloquear! 🎁`
      );
    }

    embed.setFooter({ text: "Conquistas são desbloqueadas automaticamente ao atingir os marcos!" });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Erro ao buscar conquistas");
    await interaction.editReply("❌ Erro ao buscar conquistas. Tente novamente.");
  }
}
