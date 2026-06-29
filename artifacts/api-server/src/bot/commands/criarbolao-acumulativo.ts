import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { bolaoTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { isAdmin, ADMIN_DENY_MSG } from "../lib/admin-check.js";
import {
  gerarEmbedBolao,
  criarBotaoPalpite,
  agendarEncerramentoBolao,
} from "../lib/bolao.js";

export const data = new SlashCommandBuilder()
  .setName("criarbolao-acumulativo")
  .setDescription("Cria um bolão cujo prêmio cresce com cada aposta.")
  .addStringOption((opt) =>
    opt
      .setName("dados")
      .setDescription(
        "Formato: tempo(min);time1;time2;gols_time1;gols_time2;valor_minimo  Ex: 60;Flamengo;Vasco;2;1;100"
      )
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }

  const raw = interaction.options.getString("dados", true);
  const partes = raw.split(";").map((p) => p.trim());

  if (partes.length !== 6) {
    await interaction.reply({
      content:
        "❌ Formato inválido! Use:\n`tempo(min);time1;time2;gols_time1;gols_time2;valor_minimo`\n\nExemplo: `60;Flamengo;Vasco;2;1;100`",
      ephemeral: true,
    });
    return;
  }

  const [tempoStr, time1, time2, gol1Str, gol2Str, valorMinStr] = partes;
  const tempo = parseInt(tempoStr, 10);
  const golTime1 = parseInt(gol1Str, 10);
  const golTime2 = parseInt(gol2Str, 10);
  const valorMinimo = parseInt(valorMinStr, 10);

  if (
    isNaN(tempo) || tempo <= 0 ||
    !time1 || !time2 ||
    isNaN(golTime1) || golTime1 < 0 ||
    isNaN(golTime2) || golTime2 < 0 ||
    isNaN(valorMinimo) || valorMinimo <= 0
  ) {
    await interaction.reply({
      content:
        "❌ Dados inválidos!\n• `tempo` deve ser um número positivo (minutos)\n• `gols` devem ser números ≥ 0\n• `valor_minimo` deve ser número positivo",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const encerraEm = new Date(Date.now() + tempo * 60 * 1000);

  const [bolao] = await db
    .insert(bolaoTable)
    .values({
      guildId: interaction.guildId!,
      channelId: interaction.channelId,
      criadorId: interaction.user.id,
      time1,
      time2,
      golTime1,
      golTime2,
      valorMinimo,
      premio: null,
      tipo: "acumulativo",
      encerraEm,
      encerrado: false,
    })
    .returning();

  const embed = await gerarEmbedBolao(bolao.id);
  const row = criarBotaoPalpite(bolao.id);

  const msg = await interaction.editReply({
    embeds: embed ? [embed] : [],
    components: [row],
  });

  await db
    .update(bolaoTable)
    .set({ messageId: msg.id })
    .where(eq(bolaoTable.id, bolao.id));

  const client = interaction.client;
  agendarEncerramentoBolao(client, bolao.id, encerraEm);

  logger.info(
    { bolaoId: bolao.id, guildId: interaction.guildId, tempo },
    "Bolão acumulativo criado"
  );
}
