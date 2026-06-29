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
  criarBotoesAtivo,
  agendarEncerramentoApostas,
} from "../lib/bolao.js";

export const data = new SlashCommandBuilder()
  .setName("criarbolao-acumulativo")
  .setDescription("Cria um bolão cujo prêmio cresce com cada aposta. Somente admins.")
  .addStringOption((opt) =>
    opt
      .setName("dados")
      .setDescription(
        "Formato: tempo(min);time1;time2;valor_minimo  Ex: 60;Flamengo;Vasco;100"
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

  if (partes.length !== 4) {
    await interaction.reply({
      content:
        "❌ Formato inválido! Use:\n`tempo(min);time1;time2;valor_minimo`\n\nExemplo: `60;Flamengo;Vasco;100`\n\n> O placar real será definido por um admin após o jogo com o botão **⚙️ Definir Placar**.",
      ephemeral: true,
    });
    return;
  }

  const [tempoStr, time1, time2, valorMinStr] = partes;
  const tempo = parseInt(tempoStr, 10);
  const valorMinimo = parseInt(valorMinStr, 10);

  if (
    isNaN(tempo) || tempo <= 0 ||
    !time1 || !time2 ||
    isNaN(valorMinimo) || valorMinimo <= 0
  ) {
    await interaction.reply({
      content:
        "❌ Dados inválidos!\n• `tempo` deve ser um número positivo (minutos)\n• `valor_minimo` deve ser número positivo",
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
      golTime1: null,
      golTime2: null,
      valorMinimo,
      premio: null,
      tipo: "acumulativo",
      encerraEm,
      encerrado: false,
    })
    .returning();

  const embed = await gerarEmbedBolao(bolao.id);
  const row = criarBotoesAtivo(bolao.id);

  const msg = await interaction.editReply({
    embeds: embed ? [embed] : [],
    components: [row],
  });

  await db
    .update(bolaoTable)
    .set({ messageId: msg.id })
    .where(eq(bolaoTable.id, bolao.id));

  agendarEncerramentoApostas(interaction.client, bolao.id, encerraEm);

  logger.info({ bolaoId: bolao.id, guildId: interaction.guildId, tempo }, "Bolão acumulativo criado");
}
