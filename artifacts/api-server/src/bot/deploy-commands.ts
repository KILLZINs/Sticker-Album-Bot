import { REST, Routes } from "discord.js";
import { logger } from "./lib/logger.js";
import * as adicionar from "./commands/adicionar.js";
import * as verAlbum from "./commands/ver-album.js";
import * as figurinhas from "./commands/figurinhas.js";
import * as darFigurinha from "./commands/dar-figurinha.js";
import * as repetidas from "./commands/repetidas.js";
import * as ranking from "./commands/ranking.js";
import * as remover from "./commands/remover.js";

const commands = [
  adicionar.data,
  verAlbum.data,
  figurinhas.data,
  darFigurinha.data,
  repetidas.data,
  ranking.data,
  remover.data,
].map((cmd) => cmd.toJSON());

export async function deployCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    logger.error("DISCORD_BOT_TOKEN ou DISCORD_CLIENT_ID não configurados");
    return;
  }

  const rest = new REST().setToken(token);

  try {
    logger.info(`Registrando ${commands.length} comandos slash globalmente...`);
    const data = await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });
    logger.info({ count: (data as unknown[]).length }, "Comandos registrados com sucesso!");
  } catch (err) {
    logger.error({ err }, "Erro ao registrar comandos");
    throw err;
  }
}
