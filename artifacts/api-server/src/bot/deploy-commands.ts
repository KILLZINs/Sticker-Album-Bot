import { REST, Routes } from "discord.js";
import { logger } from "./lib/logger.js";
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
import * as configurarEmojis from "./commands/configurar-emojis.js";
import * as configurarMoedas from "./commands/configurar-moedas.js";
import * as configurarFigurinhas from "./commands/configurar-figurinhas.js";
import * as modificarFigurinha from "./commands/modificar-figurinha.js";
import * as biografia from "./commands/biografia.js";
import * as comparar from "./commands/comparar.js";
import * as stats from "./commands/stats.js";
import * as recriarFigurinha from "./commands/recriar-figurinha.js";

const commands = [
  criarFigurinha.data,
  desbloquear.data,
  abrirPacote.data,
  catalogo.data,
  verAlbum.data,
  figurinhas.data,
  ranking.data,
  trocar.data,
  conquistas.data,
  rebirth.data,
  removerFigurinha.data,
  apagarFigurinha.data,
  help.data,
  saldo.data,
  darMoedas.data,
  atm.data,
  forceReset.data,
  repetidas.data,
  darFigurinha.data,
  configurarEmojis.data,
  configurarMoedas.data,
  configurarFigurinhas.data,
  modificarFigurinha.data,
  biografia.data,
  comparar.data,
  stats.data,
  recriarFigurinha.data,
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
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info({ count: (data as unknown[]).length }, "Comandos registrados com sucesso!");
  } catch (err) {
    logger.error({ err }, "Erro ao registrar comandos");
    throw err;
  }
}
