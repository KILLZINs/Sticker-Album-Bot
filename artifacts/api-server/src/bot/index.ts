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
import * as proporTroca from "./commands/propor-troca.js";
import * as conquistas from "./commands/conquistas.js";
import * as rebirth from "./commands/rebirth.js";
import * as removerFigurinha from "./commands/remover.js";
import * as apagarFigurinha from "./commands/apagar-figurinha.js";
import * as help from "./commands/help.js";
import * as saldo from "./commands/saldo.js";
import * as darMoedas from "./commands/dar-moedas.js";
import * as atm from "./commands/atm.js";
import * as forceReset from "./commands/forcereset.js";
import * as repetidas from "./commands/repetidas.js";
import * as darFigurinha from "./commands/dar-figurinha.js";
import * as configurarEmojis from "./commands/configurar-emojis.js";
import * as configurarMoedas from "./commands/configurar-moedas.js";

interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const allCommands: Command[] = [
  criarFigurinha,
  desbloquear,
  abrirPacote,
  catalogo,
  verAlbum,
  figurinhas,
  ranking,
  proporTroca,
  conquistas,
  rebirth,
  removerFigurinha,
  apagarFigurinha,
  help,
  saldo,
  darMoedas,
  atm,
  forceReset,
  repetidas,
  darFigurinha,
  configurarEmojis,
  configurarMoedas,
];

const commandMap = new Collection<string, Command>();
for (const cmd of allCommands) {
  commandMap.set(cmd.data.name, cmd);
}

export async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    logger.error("DISCORD_BOT_TOKEN não configurado — bot não será iniciado");
    return;
  }

  await deployCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "🤖 Bot do Álbum de Figurinhas online!");
  });

  // Listener de mensagens — moedas por mensagem configurável por servidor
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;
    if (message.content.length < 5) return;
    try {
      const moedaCfg = await getGuildMoedaConfig(message.guildId);
      await addMoedas(message.guildId, message.author.id, message.author.username, moedaCfg.moedasPorMensagem);
    } catch (err) {
      logger.warn({ err, userId: message.author.id }, "Falha ao adicionar moedas por mensagem");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    // --- Botões do painel de emojis (individuais) ---
    if (interaction.isButton() && interaction.customId.startsWith("emoji_btn_")) {
      await configurarEmojis.handleEmojiButton(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar botão de emoji config");
      });
      return;
    }

    // --- Botões de confirmação/cancelamento de reset de emojis ---
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("emoji_reset_confirm_") ||
        interaction.customId.startsWith("emoji_reset_cancel_"))
    ) {
      await configurarEmojis.handleResetButton(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar reset de emojis");
      });
      return;
    }

    // --- Modais do painel de emojis ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith("emoji_modal_")) {
      await configurarEmojis.handleEmojiModal(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar modal de emoji config");
      });
      return;
    }

    // --- Botões do painel de moedas ---
    if (interaction.isButton() && interaction.customId.startsWith("moeda_btn_")) {
      await configurarMoedas.handleMoedaButton(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar botão de moeda config");
      });
      return;
    }

    // --- Botões de confirmação/cancelamento de reset de moedas ---
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("moeda_reset_confirm_") ||
        interaction.customId.startsWith("moeda_reset_cancel_"))
    ) {
      await configurarMoedas.handleMoedaResetButton(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar reset de moeda config");
      });
      return;
    }

    // --- Modais do painel de moedas ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith("moeda_modal_")) {
      await configurarMoedas.handleMoedaModal(interaction).catch((err) => {
        logger.error({ err }, "Erro ao processar modal de moeda config");
      });
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
