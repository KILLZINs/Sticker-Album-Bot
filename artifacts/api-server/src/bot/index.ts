import {
  Client,
  GatewayIntentBits,
  Collection,
  ChatInputCommandInteraction,
  Interaction,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { logger } from "./lib/logger.js";
import { deployCommands } from "./deploy-commands.js";
import { addMoedas } from "./lib/moedas.js";
import { getGuildMoedaConfig } from "./lib/moeda-config.js";
import * as criarFigurinha from "./commands/criar-figurinha.js";
import * as desbloquear from "./commands/desbloquear.js";
import * as abrirPacote from "./commands/abrir-pacote.js";
import * as catalogo from "./commands/catalogo.js";
import * as verAlbum from "./commands/ver-album.js";
import * as figurinhas from "./commands/figurinhas.js";
import * as ranking from "./commands/ranking.js";
import * as trocar from "./commands/trocar.js";
import * as conquistas from "./commands/conquistas.js";
import * as rebirth from "./commands/rebirth.js";
import * as removerFigurinha from "./commands/remover.js";
import * as apagarFigurinha from "./commands/apagar-figurinha.js";
import * as help from "./commands/help.js";
import * as saldo from "./commands/saldo.js";
import * as darMoedas from "./commands/dar-moedas.js";
import * as atm from "./commands/atm.js";
import * as forceReset from "./commands/forcereset.js";
import * as forceResetAll from "./commands/forceresetall.js";
import * as repetidas from "./commands/repetidas.js";
import * as darFigurinha from "./commands/dar-figurinha.js";
import * as configurarEmojis from "./commands/configurar-emojis.js";
import * as configurarMoedas from "./commands/configurar-moedas.js";
import * as configurarFigurinhas from "./commands/configurar-figurinhas.js";
import * as modificarFigurinha from "./commands/modificar-figurinha.js";
import * as biografia from "./commands/biografia.js";
import * as comparar from "./commands/comparar.js";
import * as stats from "./commands/stats.js";
import * as configurarAdmin from "./commands/configurar-admin.js";
import * as criarBolaoNormal from "./commands/criarbolao-normal.js";
import * as criarBolaoAcumulativo from "./commands/criarbolao-acumulativo.js";
import { refreshExpiredUrlsInGuild } from "./lib/refresh-urls.js";
import {
  handleBolaoButton,
  handleBolaoModal,
  handleEncerrarApostasButton,
  handleDefinirPlacarButton,
  handleDefinirPlacarModal,
  handleEditarPremioButton,
  handleEditarPremioModal,
  restaurarTimersBolao,
} from "./lib/bolao.js";

interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const allCommands: Command[] = [
  criarFigurinha, desbloquear, abrirPacote, catalogo, verAlbum, figurinhas,
  ranking, trocar, conquistas, rebirth, removerFigurinha, apagarFigurinha,
  help, saldo, darMoedas, atm, forceReset, forceResetAll, repetidas, darFigurinha,
  configurarEmojis, configurarMoedas, configurarFigurinhas, modificarFigurinha,
  biografia, comparar, stats, configurarAdmin,
  criarBolaoNormal, criarBolaoAcumulativo,
];

const commandMap = new Collection<string, Command>();
for (const cmd of allCommands) commandMap.set(cmd.data.name, cmd);

export async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { logger.error("DISCORD_BOT_TOKEN não configurado — bot não será iniciado"); return; }

  await deployCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "🤖 Bot online!");

    restaurarTimersBolao(c).catch((err) =>
      logger.warn({ err }, "Erro ao restaurar timers de bolões")
    );

    const runUrlRefresh = async () => {
      const guilds = [...c.guilds.cache.values()];
      logger.info({ count: guilds.length }, "🔄 Iniciando refresh de URLs expiradas...");
      for (const guild of guilds) {
        await refreshExpiredUrlsInGuild(c.rest, guild.id);
      }
    };
    setTimeout(() => {
      runUrlRefresh().catch((err) => logger.warn({ err }, "Erro no refresh inicial de URLs"));
    }, 2 * 60 * 1000);
    setInterval(() => {
      runUrlRefresh().catch((err) => logger.warn({ err }, "Erro no refresh periódico de URLs"));
    }, 12 * 60 * 60 * 1000);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guildId) return;

    // Easter egg: resposta ao criador
    if (message.content.toLowerCase().includes("skyritas quem é teu criador")) {
      await message.reply("<@1195254699943796791> né tropa").catch(() => {});
      return;
    }

    try {
      const moedaCfg = await getGuildMoedaConfig(message.guildId);
      if (message.content.length < moedaCfg.comprimentoMinMensagem) return;
      await addMoedas(message.guildId, message.author.id, message.author.username, moedaCfg.moedasPorMensagem);
    } catch (err) {
      logger.warn({ err, userId: message.author.id }, "Falha ao adicionar moedas por mensagem");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {

    // ── Bolão: handlers com fallback de erro ──
    const safeReply = async (i: typeof interaction, err: unknown) => {
      logger.error({ err, customId: (i as any).customId }, "Erro em handler de bolão");
      const msg = { content: "❌ Ocorreu um erro interno. Tente novamente.", ephemeral: true };
      try {
        if ((i as any).deferred) await (i as any).followUp(msg);
        else if (!(i as any).replied) await (i as any).reply(msg);
      } catch { /* interação expirada, ignora */ }
    };

    if (interaction.isButton() && interaction.customId.startsWith("bolao_palpite_")) {
      await handleBolaoButton(interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("bolao_encerrar_")) {
      await handleEncerrarApostasButton(client, interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("bolao_placar_")) {
      await handleDefinirPlacarButton(interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("bolao_modal_")) {
      await handleBolaoModal(client, interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("bolao_placar_modal_")) {
      await handleDefinirPlacarModal(client, interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("bolao_editarpremio_")) {
      await handleEditarPremioButton(interaction).catch((err) => safeReply(interaction, err));
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("bolao_premio_modal_")) {
      await handleEditarPremioModal(client, interaction).catch((err) => safeReply(interaction, err));
      return;
    }

    // ── Emojis: Select Menus ──
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("emoji_sel_")) {
      await configurarEmojis.handleEmojiSelect(interaction).catch((err) => logger.error({ err }, "Erro emoji select"));
      return;
    }

    // ── Emojis: Buttons ──
    if (interaction.isButton() && interaction.customId === "emoji_btn_reset") {
      await configurarEmojis.handleEmojiButton(interaction).catch((err) => logger.error({ err }, "Erro emoji btn"));
      return;
    }
    if (interaction.isButton() && (interaction.customId.startsWith("emoji_reset_confirm_") || interaction.customId.startsWith("emoji_reset_cancel_"))) {
      await configurarEmojis.handleResetButton(interaction).catch((err) => logger.error({ err }, "Erro emoji reset"));
      return;
    }

    // ── Emojis: Modal ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith("emoji_modal_")) {
      await configurarEmojis.handleEmojiModal(interaction).catch((err) => logger.error({ err }, "Erro emoji modal"));
      return;
    }

    // ── Moedas: Buttons ──
    if (interaction.isButton() && interaction.customId.startsWith("moeda_btn_")) {
      await configurarMoedas.handleMoedaButton(interaction).catch((err) => logger.error({ err }, "Erro moeda btn"));
      return;
    }
    if (interaction.isButton() && (interaction.customId.startsWith("moeda_reset_confirm_") || interaction.customId.startsWith("moeda_reset_cancel_"))) {
      await configurarMoedas.handleMoedaResetButton(interaction).catch((err) => logger.error({ err }, "Erro moeda reset"));
      return;
    }

    // ── Moedas: Modal ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith("moeda_modal_")) {
      await configurarMoedas.handleMoedaModal(interaction).catch((err) => logger.error({ err }, "Erro moeda modal"));
      return;
    }

    // ── Figurinhas config: Buttons ──
    if (interaction.isButton() && interaction.customId.startsWith("fig_btn_")) {
      await configurarFigurinhas.handleFigurinhaButton(interaction).catch((err) => logger.error({ err }, "Erro fig btn"));
      return;
    }
    if (interaction.isButton() && (interaction.customId.startsWith("fig_reset_confirm_") || interaction.customId.startsWith("fig_reset_cancel_"))) {
      await configurarFigurinhas.handleFigurinhaResetButton(interaction).catch((err) => logger.error({ err }, "Erro fig reset"));
      return;
    }

    // ── Figurinhas config: Modal ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith("fig_modal_")) {
      await configurarFigurinhas.handleFigurinhaModal(interaction).catch((err) => logger.error({ err }, "Erro fig modal"));
      return;
    }

    // ── Abrir Pacote ──
    if (interaction.isButton() && (
      interaction.customId.startsWith("pacote_prev_") ||
      interaction.customId.startsWith("pacote_next_") ||
      interaction.customId.startsWith("pacote_summary_") ||
      interaction.customId.startsWith("pacote_back_")
    )) {
      await abrirPacote.handlePackNavigation(interaction).catch((err) => logger.error({ err }, "Erro nav pacote"));
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Erro ao executar comando");
      const msg = { content: "❌ Ocorreu um erro ao executar este comando.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  });

  await client.login(token);
}
