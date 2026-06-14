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
import * as repetidas from "./commands/repetidas.js";
import * as darFigurinha from "./commands/dar-figurinha.js";
import * as biografia from "./commands/biografia.js";
import * as comparar from "./commands/comparar.js";
import * as configurarEmojis from "./commands/configurar-emojis.js";
import * as configurarFigurinhas from "./commands/configurar-figurinhas.js";
import * as configurarMoedas from "./commands/configurar-moedas.js";
import * as modificarFigurinha from "./commands/modificar-figurinha.js";
import * as stats from "./commands/stats.js";
import * as adicionar from "./commands/adicionar.js";

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
  trocar,
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
  biografia,
  comparar,
  configurarEmojis,
  configurarFigurinhas,
  configurarMoedas,
  modificarFigurinha,
  stats,
  adicionar,
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
      // MessageContent é um privileged intent — precisa ser ativado no Discord Developer Portal
      // Bot Settings → Privileged Gateway Intents → Message Content Intent
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "🤖 Bot do Álbum de Figurinhas online!");
  });

  // Listener de mensagens — moedas por mensagem (configurável por servidor)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;
    try {
      const moedaCfg = await getGuildMoedaConfig(message.guildId);
      if (message.content.length < moedaCfg.comprimentoMinMensagem) return;
      await addMoedas(message.guildId, message.author.id, message.author.username, moedaCfg.moedasPorMensagem);
    } catch (err) {
      logger.warn({ err, userId: message.author.id }, "Falha ao adicionar moedas por mensagem");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    // ── Abrir Pacote: navegação prev/next/resumo ──
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("pacote_prev_") ||
        interaction.customId.startsWith("pacote_next_") ||
        interaction.customId.startsWith("pacote_resumo_"))
    ) {
      await abrirPacote.handlePackNavigation(interaction).catch(async (err) => {
        logger.error({ err }, "Erro nav pacote");
        await interaction
          .reply({ content: "❌ Ocorreu um erro ao processar o botão. Tente novamente.", ephemeral: true })
          .catch(() => {});
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
