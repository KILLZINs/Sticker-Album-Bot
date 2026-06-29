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
  .setName("criarbolao-normal")
  .setDescription("Cria um bolão com prêmio fixo. Somente admins.")
  .addIntegerOption((opt) =>
    opt
      .setName("tempo")
      .setDescription("Duração das apostas em minutos (ex: 60)")
      .setMinValue(1)
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("time1")
      .setDescription("Nome do primeiro time (ex: Flamengo)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("time2")
      .setDescription("Nome do segundo time (ex: Vasco)")
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("valor_minimo")
      .setDescription("Valor mínimo de aposta em moedas (ex: 100)")
      .setMinValue(1)
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("premio")
      .setDescription("Prêmio fixo para os vencedores em moedas (ex: 500)")
      .setMinValue(1)
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await isAdmin(interaction))) {
    await interaction.reply({ content: ADMIN_DENY_MSG, ephemeral: true });
    return;
  }

  const tempo = interaction.options.getInteger("tempo", true);
  const time1 = interaction.options.getString("time1", true).trim();
  const time2 = interaction.options.getString("time2", true).trim();
  const valorMinimo = interaction.options.getInteger("valor_minimo", true);
  const premio = interaction.options.getInteger("premio", true);

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
      premio,
      tipo: "normal",
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

  logger.info({ bolaoId: bolao.id, guildId: interaction.guildId, tempo }, "Bolão normal criado");
}
