import {
  Client,
  GatewayIntentBits,
  Collection,
  ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { logger } from "./lib/logger.js";
import { deployCommands } from "./deploy-commands.js";
import * as criarFigurinha from "./commands/criar-figurinha.js";
import * as desbloquear from "./commands/desbloquear.js";
import * as catalogo from "./commands/catalogo.js";
import * as verAlbum from "./commands/ver-album.js";
import * as figurinhas from "./commands/figurinhas.js";
import * as ranking from "./commands/ranking.js";

interface Command {
  data: SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const allCommands: Command[] = [
  criarFigurinha,
  desbloquear,
  catalogo,
  verAlbum,
  figurinhas,
  ranking,
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
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "🤖 Bot do Álbum de Figurinhas online!");
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
