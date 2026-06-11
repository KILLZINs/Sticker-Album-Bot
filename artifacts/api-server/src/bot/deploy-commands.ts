import { REST, Routes } from "discord.js";
import { logger } from "./lib/logger.ts";
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

const commands = [
  criarFigurinha.data,
  desbloquear.data,
  abrirPacote.data,
  catalogo.data,
  verAlbum.data,
  figurinhas.data,
  ranking.data,
  proporTroca.data,
  conquistas.data,
  rebirth.data,
  removerFigurinha.data,
  apagarFigurinha.data,
  help.data,
  saldo.data,
  darMoedas.data,
  forcereset.data,
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
