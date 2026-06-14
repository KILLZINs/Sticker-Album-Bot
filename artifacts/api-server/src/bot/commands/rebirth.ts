import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db } from "@workspace/db";
import { colecaoUsuarioTable, catalogoFigurinhasTable } from "@workspace/db";
import { eq, and, countDistinct } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getSaldo,
  getNivelRebirth,
  setNivelRebirth,
  PACKS,
  calcularPreco,
  MAX_NIVEL,
  type TipoPacote,
} from "../lib/moedas.js";
import { getGuildEmojis, getNivelDisplay, type GuildEmojis } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("rebirth")
  .setDescription("Suba de nível! Reseta seu álbum e conquista descontos permanentes nos pacotinhos.");

const PACK_EMOJI_CHAVE: Record<TipoPacote, keyof GuildEmojis> = {
  standard: "pacote_standard",
  deluxe: "pacote_deluxe",
  ultimate: "pacote_ultimate",
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    const [nivel, saldo, emojis, moedaCfg] = await Promise.all([
      getNivelRebirth(guildId, userId),
      getSaldo(guildId, userId),
      getGuildEmojis(guildId),
      getGuildMoedaConfig(guildId),
    ]);

    const nivelAtualNome = getNivelDisplay(emojis, nivel);
    const nomeMoeda = moedaCfg.nomeMoeda;

    if (nivel >= MAX_NIVEL) {
      const embed = new EmbedBuilder()
        .setTitle(`${emojis.nivel_ouro} Nível Máximo Atingido!`)
        .setDescription(
          `Você já está no nível máximo: **${nivelAtualNome}**\n\n` +
          `🎉 Parabéns! Continue colecionando figurinhas!`
        )
        .setColor(0xf39c12)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const [totalCatResult, totalUsuResult] = await Promise.all([
      db.select({ total: countDistinct(catalogoFigurinhasTable.id) })
        .from(catalogoFigurinhasTable)
        .where(eq(catalogoFigurinhasTable.guildId, guildId)),
      db.select({ total: countDistinct(colecaoUsuarioTable.catalogoId) })
        .from(colecaoUsuarioTable)
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId))),
    ]);

    const totalCatalogo = totalCatResult[0]?.total ?? 0;
    const totalUsuario = totalUsuResult[0]?.total ?? 0;

    if (totalCatalogo === 0 || totalUsuario < totalCatalogo) {
      const pct = totalCatalogo > 0 ? Math.round((totalUsuario / totalCatalogo) * 100) : 0;
      const barraLen = 16;
      const preenchido = Math.round((pct / 100) * barraLen);
      const barra = "█".repeat(preenchido) + "░".repeat(barraLen - preenchido);

      const embed = new EmbedBuilder()
        .setTitle("❌ Coleção incompleta para Rebirth!")
        .setDescription(
          `Você precisa coletar **TODAS** as figurinhas do catálogo antes de fazer o Rebirth.\n\n` +
          `**Progresso:**\n\`${barra}\` ${totalUsuario}/${totalCatalogo} (**${pct}%**)\n\n` +
          `Use **/catalogo** para ver quais figurinhas ainda faltam.`
        )
        .setColor(0xe74c3c)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const proximoNivel = nivel + 1;
    const proximoNome = getNivelDisplay(emojis, proximoNivel);

    const precosBase: Record<TipoPacote, number> = {
      standard: moedaCfg.precoStandard,
      deluxe: moedaCfg.precoDeluxe,
      ultimate: moedaCfg.precoUltimate,
    };

    const linhasPrecos = (Object.entries(PACKS) as [TipoPacote, typeof PACKS[TipoPacote]][])
      .map(([tipo, pack]) => {
        const precoAtual = calcularPreco(precosBase[tipo], nivel);
        const precoNovo = calcularPreco(precosBase[tipo], proximoNivel);
        const packEmoji = emojis[PACK_EMOJI_CHAVE[tipo]];
        return `${packEmoji} **${pack.nome}**: ~~${precoAtual}~~ → **${precoNovo}** ${nomeMoeda}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`🔁 Rebirth — ${nivelAtualNome} → ${proximoNome}`)
      .setDescription(
        `> ⚠️ **Seu álbum será resetado completamente!**\n` +
        `> Todas as suas figurinhas serão perdidas permanentemente.\n` +
        `> Suas **${saldo.toLocaleString("pt-BR")} ${nomeMoeda}** e conquistas **serão mantidas**.\n\n` +
        `**Novos preços após o Rebirth:**\n${linhasPrecos}\n\n` +
        `Deseja evoluir para **${proximoNome}**?`
      )
      .setColor(0x9b59b6)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("rebirth_confirm")
        .setLabel("🔁 Confirmar Rebirth")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("rebirth_cancel")
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === userId,
    });

    collector.on("collect", async (btn) => {
      collector.stop();

      if (btn.customId === "rebirth_cancel") {
        await btn.update({ content: "❎ Rebirth cancelado.", embeds: [], components: [] });
        return;
      }

      await db
        .delete(colecaoUsuarioTable)
        .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId)));

      await setNivelRebirth(guildId, userId, username, proximoNivel);

      const embedSucesso = new EmbedBuilder()
        .setTitle(`🎉 Rebirth concluído! Bem-vindo ao ${proximoNome}!`)
        .setDescription(
          `Seu álbum foi resetado. Você é agora **${proximoNome}**!\n\n` +
          `**Seus novos preços de pacotinhos:**\n${linhasPrecos}\n\n` +
          `Abra pacotinhos para reconstruir sua coleção! 🚀`
        )
        .setColor(0x470f78)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await btn.update({ embeds: [embedSucesso], components: [] });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction
          .editReply({ content: "⏰ Rebirth expirou — nenhuma ação tomada.", embeds: [], components: [] })
          .catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao processar rebirth");
    await interaction.editReply("❌ Erro ao processar o rebirth. Tente novamente.");
  }
}
