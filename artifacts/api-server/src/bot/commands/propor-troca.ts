import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

export const data = new SlashCommandBuilder()
  .setName("propor-troca")
  .setDescription("Propõe uma troca de figurinha com outro usuário")
  .addUserOption((opt) =>
    opt.setName("usuario").setDescription("Com quem você quer trocar").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("minha-figurinha")
      .setDescription("Número (no catálogo) da figurinha que você vai dar")
      .setRequired(true)
      .setMinValue(1)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("figurinha-deles")
      .setDescription("Número (no catálogo) da figurinha que você quer receber")
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const destino = interaction.options.getUser("usuario", true);
  const meuNumero = interaction.options.getInteger("minha-figurinha", true);
  const delesNumero = interaction.options.getInteger("figurinha-deles", true);
  const guildId = interaction.guildId!;
  const meuId = interaction.user.id;

  if (destino.id === meuId) {
    await interaction.editReply("❌ Você não pode propor uma troca com você mesmo!");
    return;
  }
  if (destino.bot) {
    await interaction.editReply("❌ Você não pode trocar com bots!");
    return;
  }
  if (meuNumero === delesNumero) {
    await interaction.editReply("❌ Você está propondo trocar figurinhas idênticas!");
    return;
  }

  try {
    // Buscar minha figurinha no catálogo + verificar se eu tenho
    const [minhaFigCatalogo] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, meuNumero)
        )
      )
      .limit(1);

    if (!minhaFigCatalogo) {
      await interaction.editReply(`❌ Figurinha #${meuNumero} não existe no catálogo!`);
      return;
    }

    const [minhaNaColecao] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, meuId),
          eq(colecaoUsuarioTable.catalogoId, minhaFigCatalogo.id)
        )
      )
      .limit(1);

    if (!minhaNaColecao) {
      await interaction.editReply(
        `❌ Você não tem a figurinha **#${meuNumero} — ${minhaFigCatalogo.titulo}** no seu álbum!`
      );
      return;
    }

    // Buscar figurinha deles no catálogo + verificar se eles têm
    const [deleFigCatalogo] = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(
        and(
          eq(catalogoFigurinhasTable.guildId, guildId),
          eq(catalogoFigurinhasTable.numero, delesNumero)
        )
      )
      .limit(1);

    if (!deleFigCatalogo) {
      await interaction.editReply(`❌ Figurinha #${delesNumero} não existe no catálogo!`);
      return;
    }

    const [deleNaColecao] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, destino.id),
          eq(colecaoUsuarioTable.catalogoId, deleFigCatalogo.id)
        )
      )
      .limit(1);

    if (!deleNaColecao) {
      await interaction.editReply(
        `❌ <@${destino.id}> não tem a figurinha **#${delesNumero} — ${deleFigCatalogo.titulo}** no álbum!`
      );
      return;
    }

    // Verificar se eu já tenho a que quero receber
    const [jaTemDelesNaMinha] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, meuId),
          eq(colecaoUsuarioTable.catalogoId, deleFigCatalogo.id)
        )
      )
      .limit(1);

    if (jaTemDelesNaMinha) {
      await interaction.editReply(
        `⚠️ Você já tem a figurinha **#${delesNumero} — ${deleFigCatalogo.titulo}** no seu álbum!`
      );
      return;
    }

    // Verificar se o destino já tem o que receberá
    const [deleJaTemMinha] = await db
      .select()
      .from(colecaoUsuarioTable)
      .where(
        and(
          eq(colecaoUsuarioTable.guildId, guildId),
          eq(colecaoUsuarioTable.userId, destino.id),
          eq(colecaoUsuarioTable.catalogoId, minhaFigCatalogo.id)
        )
      )
      .limit(1);

    if (deleJaTemMinha) {
      await interaction.editReply(
        `⚠️ <@${destino.id}> já tem a figurinha **#${meuNumero} — ${minhaFigCatalogo.titulo}** e não vai querer receber em troca!`
      );
      return;
    }

    const emojiMinha = RARIDADE_EMOJI[minhaFigCatalogo.raridade] ?? "⚪";
    const emojiDele = RARIDADE_EMOJI[deleFigCatalogo.raridade] ?? "⚪";

    const embedProposta = new EmbedBuilder()
      .setTitle("🔄 Proposta de troca!")
      .setDescription(
        `<@${meuId}> quer trocar com <@${destino.id}>!\n\n` +
          `**<@${meuId}> oferece:**\n${emojiMinha} **#${minhaFigCatalogo.numero}** ${minhaFigCatalogo.titulo} (${minhaFigCatalogo.raridade})\n\n` +
          `**<@${meuId}> quer receber:**\n${emojiDele} **#${deleFigCatalogo.numero}** ${deleFigCatalogo.titulo} (${deleFigCatalogo.raridade})`
      )
      .setColor(0xfee75c)
      .addFields(
        {
          name: `${emojiMinha} Dá`,
          value: `[#${minhaFigCatalogo.numero}] ${minhaFigCatalogo.titulo}`,
          inline: true,
        },
        { name: "↔️", value: "troca por", inline: true },
        {
          name: `${emojiDele} Recebe`,
          value: `[#${deleFigCatalogo.numero}] ${deleFigCatalogo.titulo}`,
          inline: true,
        }
      )
      .setFooter({ text: `⏳ <@${destino.id}> tem 2 minutos para aceitar ou recusar.` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("aceitar_troca")
        .setLabel("✅ Aceitar troca")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("recusar_troca")
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.editReply({
      content: `<@${destino.id}>, você recebeu uma proposta de troca!`,
      embeds: [embedProposta],
      components: [row],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
      filter: (i) => i.user.id === destino.id,
      max: 1,
    });

    collector.on("collect", async (btnInteraction: ButtonInteraction) => {
      if (btnInteraction.customId === "recusar_troca") {
        await btnInteraction.update({
          content: `❌ <@${destino.id}> recusou a troca.`,
          embeds: [embedProposta.setColor(0xed4245)],
          components: [],
        });
        return;
      }

      // Aceitar — verificar novamente se os dois ainda têm as figurinhas
      try {
        const [minhaAtual] = await db
          .select()
          .from(colecaoUsuarioTable)
          .where(
            and(
              eq(colecaoUsuarioTable.guildId, guildId),
              eq(colecaoUsuarioTable.userId, meuId),
              eq(colecaoUsuarioTable.catalogoId, minhaFigCatalogo.id)
            )
          )
          .limit(1);

        const [deleAtual] = await db
          .select()
          .from(colecaoUsuarioTable)
          .where(
            and(
              eq(colecaoUsuarioTable.guildId, guildId),
              eq(colecaoUsuarioTable.userId, destino.id),
              eq(colecaoUsuarioTable.catalogoId, deleFigCatalogo.id)
            )
          )
          .limit(1);

        if (!minhaAtual || !deleAtual) {
          await btnInteraction.update({
            content: "❌ Troca cancelada: um dos usuários não tem mais a figurinha.",
            embeds: [embedProposta.setColor(0xed4245)],
            components: [],
          });
          return;
        }

        // Realizar a troca: deletar as entradas e reinserir com novos donos
        await db
          .delete(colecaoUsuarioTable)
          .where(eq(colecaoUsuarioTable.id, minhaAtual.id));
        await db
          .delete(colecaoUsuarioTable)
          .where(eq(colecaoUsuarioTable.id, deleAtual.id));

        await db.insert(colecaoUsuarioTable).values({
          guildId,
          userId: meuId,
          username: interaction.user.username,
          catalogoId: deleFigCatalogo.id,
        });
        await db.insert(colecaoUsuarioTable).values({
          guildId,
          userId: destino.id,
          username: destino.username,
          catalogoId: minhaFigCatalogo.id,
        });

        const embedSucesso = new EmbedBuilder()
          .setTitle("🎉 Troca realizada com sucesso!")
          .setDescription(
            `**<@${meuId}>** recebeu: ${emojiDele} **${deleFigCatalogo.titulo}**\n` +
              `**<@${destino.id}>** recebeu: ${emojiMinha} **${minhaFigCatalogo.titulo}**`
          )
          .setColor(0x57f287)
          .setTimestamp();

        await btnInteraction.update({
          content: `✅ Troca entre <@${meuId}> e <@${destino.id}> concluída!`,
          embeds: [embedSucesso],
          components: [],
        });
      } catch (err) {
        logger.error({ err }, "Erro ao realizar troca");
        await btnInteraction.update({
          content: "❌ Erro ao realizar a troca. Tente novamente.",
          embeds: [],
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction
          .editReply({
            content: `⏰ A proposta de troca expirou — <@${destino.id}> não respondeu a tempo.`,
            embeds: [embedProposta.setColor(0x99aab5)],
            components: [],
          })
          .catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao propor troca");
    await interaction.editReply("❌ Erro ao criar a proposta. Tente novamente.");
  }
}
