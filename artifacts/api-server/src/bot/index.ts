import {
  Client,
  GatewayIntentBits,
  Collection,
  ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { logger } from "./lib/logger.ts";
import { deployCommands } from "./deploy-commands.ts";
import { addMoedas } from "./lib/moedas.ts";
import * as criarFigurinha from "./commands/criar-figurinha.ts";
import * as desbloquear from "./commands/desbloquear.ts";
import * as abrirPacote from "./commands/abrir-pacote.ts";
import * as catalogo from "./commands/catalogo.ts";
import * as verAlbum from "./commands/ver-album.ts";
import * as figurinhas from "./commands/figurinhas.ts";
import * as ranking from "./commands/ranking.ts";
import * as proporTroca from "./commands/propor-troca.ts";
import * as conquistas from "./commands/conquistas.ts";
import * as rebirth from "./commands/rebirth.ts";
import * as removerFigurinha from "./commands/remover.ts";
import * as apagarFigurinha from "./commands/apagar-figurinha.ts";
import * as help from "./commands/help.ts";
import * as saldo from "./commands/saldo.ts";
import * as darMoedas from "./commands/dar-moedas.ts";
import * as forcereset from "./commands/forcereset.ts";

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
  forcereset,
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

  // Listener de mensagens — +2 moedas por mensagem com mais de 8 caracteres
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;
    if (message.content.length <= 8) return;
    await addMoedas(message.guildId, message.author.id, message.author.username, 2);
  });

  client.on("interactionCreate", async (interaction) => {
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
