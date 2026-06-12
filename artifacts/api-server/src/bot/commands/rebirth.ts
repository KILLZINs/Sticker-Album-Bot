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
import { eq, and, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getSaldo,
  getNivelRebirth,
  setNivelRebirth,
  PACKS,
  calcularPreco,
  MAX_NIVEL,
} from "../lib/moedas.js";
import { getGuildEmojis, getNivelDisplay } from "../lib/emoji-config.js";
import { getGuildMoedaConfig } from "../lib/moeda-config.js";

export const data = new SlashCommandBuilder()
  .setName("rebirth")
  .setDescription("Suba de nível! Reseta seu álbum e ganha preços menores nos pacotinhos.");

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
          `Parabéns por chegar ao topo! Continue colecionando figurinhas! 🎉`
        )
        .setColor(0x470f78)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const [{ totalCatalogo }] = await db
      .select({ totalCatalogo: count() })
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    const [{ totalUsuario }] = await db
      .select({ totalUsuario: count() })
      .from(colecaoUsuarioTable)
      .where(and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId)));

    if (totalCatalogo === 0 || totalUsuario < totalCatalogo) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Coleção incompleta!")
        .setDescription(
          `Você precisa coletar **TODAS** as figurinhas do catálogo antes de fazer o Rebirth.\n\n` +
          `📊 Seu progresso: **${totalUsuario}/${totalCatalogo}** figurinhas\n\n` +
          `Use **/catalogo** para ver quais figurinhas ainda faltam.`
        )
        .setColor(0x470f78)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const proximoNivel = nivel + 1;
    const proximoNome = getNivelDisplay(emojis, proximoNivel);

    const precosBase: Record<string, number> = {
      standard: moedaCfg.precoStandard,
      deluxe: moedaCfg.precoDeluxe,
      ultimate: moedaCfg.precoUltimate,
    };

    const linhasPrecos = Object.entries(PACKS)
      .map(([tipo, pack]) => {
        const precoAtual = calcularPreco(precosBase[tipo] ?? pack.precoBase, nivel);
        const precoNovo = calcularPreco(precosBase[tipo] ?? pack.precoBase, proximoNivel);
        return `${pack.emoji} **${pack.nome}**: ~~${precoAtual}~~ → **${precoNovo} ${nomeMoeda}**`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`🔁 Rebirth — ${nivelAtualNome} → ${proximoNome}`)
      .setDescription(
        `> ⚠️ **ATENÇÃO:** Seu álbum será **completamente resetado**!\n` +
        `> Todas as suas figurinhas serão perdidas.\n` +
        `> Suas ${nomeMoeda} (**${saldo}**) e conquistas serão **mantidas**.\n\n` +
        `**Novos preços dos pacotinhos após o Rebirth:**\n${linhasPrecos}\n\n` +
        `Tem certeza que deseja fazer o Rebirth para **${proximoNome}**?`
      )
      .setColor(0x7B2FBE)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("rebirth_confirm")
        .setLabel("✅ Confirmar Rebirth")
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

      await db.delete(colecaoUsuarioTable).where(
        and(eq(colecaoUsuarioTable.guildId, guildId), eq(colecaoUsuarioTable.userId, userId))
      );

      await setNivelRebirth(guildId, userId, username, proximoNivel);

      const embedSucesso = new EmbedBuilder()
        .setTitle(`🎉 Rebirth concluído! Bem-vindo ao ${proximoNome}!`)
        .setDescription(
          `Seu álbum foi resetado e agora você é **${proximoNome}**!\n\n` +
          `**Seus novos preços de pacotinhos:**\n${linhasPrecos}\n\n` +
          `Abra pacotinhos para reconstruir seu álbum! 🚀`
        )
        .setColor(0x470f78)
        .setTimestamp();

      await btn.update({ embeds: [embedSucesso], components: [] });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({ content: "⏰ Rebirth expirou — nenhuma ação tomada.", embeds: [], components: [] }).catch(() => {});
      }
    });
  } catch (err) {
    logger.error({ err }, "Erro ao processar rebirth");
    await interaction.editReply("❌ Erro ao processar o rebirth. Tente novamente.");
  }
}
