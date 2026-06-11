import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { catalogoFigurinhasTable, colecaoUsuarioTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { verificarConquistas, anunciarConquistas } from "../lib/conquistas.js";
import {
  getSaldo,
  deductMoedas,
  getNivelRebirth,
  PACKS,
  NIVEL_NOME,
  calcularPreco,
  type TipoPacote,
} from "../lib/moedas.js";

const RARIDADE_PESO: Record<string, number> = {
  comum: 55,
  incomum: 25,
  rara: 12,
  épica: 6,
  lendária: 2,
};

const RARIDADE_EMOJI: Record<string, string> = {
  comum: "⚪",
  incomum: "🟢",
  rara: "🔵",
  épica: "🟣",
  lendária: "🌟",
};

export const data = new SlashCommandBuilder()
  .setName("abrir-pacote")
  .setDescription("Compra e abre um pacotinho de figurinhas com suas moedas!")
  .addStringOption((opt) =>
    opt
      .setName("tipo")
      .setDescription("Tipo do pacotinho a comprar")
      .setRequired(true)
      .addChoices(
        { name: "📦 Standard — 3 figurinhas • 300 moedas", value: "standard" },
        { name: "🎁 Deluxe — 5 figurinhas • 500 moedas", value: "deluxe" },
        { name: "⭐ Ultimate — 10 figurinhas • 1000 moedas", value: "ultimate" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const tipo = interaction.options.getString("tipo", true) as TipoPacote;

  try {
    const pack = PACKS[tipo];
    const nivel = await getNivelRebirth(guildId, userId);
    const preco = calcularPreco(pack.precoBase, nivel);
    const saldo = await getSaldo(guildId, userId);
    const nivelNome = NIVEL_NOME[nivel] ?? "Normal";

    if (saldo < preco) {
      const descPct = Math.round((1 - preco / pack.precoBase) * 100);
      const descTxt = descPct > 0 ? ` (${descPct}% desconto — ${nivelNome})` : "";
      await interaction.editReply(
        `❌ **Saldo insuficiente!**\n\n` +
          `💰 Seu saldo: **${saldo} moedas**\n` +
          `${pack.emoji} Pacote **${pack.nome}**: **${preco} moedas**${descTxt}\n\n` +
          `Envie mensagens com mais de 8 caracteres para ganhar moedas! **(+2 por mensagem)**`
      );
      return;
    }

    // Buscar catálogo completo — figurinhas repetidas são permitidas!
    const catalogo = await db
      .select()
      .from(catalogoFigurinhasTable)
      .where(eq(catalogoFigurinhasTable.guildId, guildId));

    if (catalogo.length === 0) {
      await interaction.editReply(
        "📭 O catálogo está vazio! Um admin precisa criar figurinhas com **/criar-figurinha** primeiro."
      );
      return;
    }

    // Deduzir moedas antes de sortear — atomic deduction returns the real new balance
    const novoSaldo = await deductMoedas(guildId, userId, username, preco);

    // Sortear com peso por raridade (duplicatas permitidas — pool completo a cada sorteio)
    const sorteadas = sortearComPeso(catalogo, pack.figurinhas);

    // Inserir na coleção (sem unique constraint — permite repetidas)
    await db.insert(colecaoUsuarioTable).values(
      sorteadas.map((fig) => ({ guildId, userId, username, catalogoId: fig.id }))
    );

    const maisRara = sorteadas.reduce((melhor, atual) =>
      (RARIDADE_PESO[atual.raridade] ?? 55) < (RARIDADE_PESO[melhor.raridade] ?? 55)
        ? atual
        : melhor,
      sorteadas[0]!
    );
    const linhas = sorteadas.map((fig) => {
      const emoji = RARIDADE_EMOJI[fig.raridade] ?? "⚪";
      return `${emoji} **${fig.titulo}** — ${fig.raridade}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${pack.emoji} Pacote ${pack.nome} de ${username} aberto!`)
      .setDescription(
        `Você ganhou **${sorteadas.length} figurinha${sorteadas.length > 1 ? "s" : ""}**!\n\n` +
          linhas.join("\n")
      )
      .setImage(maisRara.imageUrl)
      .setColor(getRaridadeColor(maisRara.raridade))
      .addFields(
        { name: "💰 Saldo restante", value: `${novoSaldo} moedas`, inline: true },
        { name: "🏆 Nível do álbum", value: nivelNome, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const novas = await verificarConquistas(guildId, userId, username, {
      abreuPacote: true,
      figurinhasNovas: sorteadas.map((f) => ({ raridade: f.raridade })),
    });
    await anunciarConquistas(interaction.channelId, userId, novas, interaction.client);
  } catch (err) {
    logger.error({ err }, "Erro ao abrir pacote");
    await interaction.editReply("❌ Erro ao abrir o pacotinho. Tente novamente.");
  }
}

function sortearComPeso(
  figurinhas: typeof catalogoFigurinhasTable.$inferSelect[],
  quantidade: number
): typeof catalogoFigurinhasTable.$inferSelect[] {
  if (figurinhas.length === 0) return [];
  const resultado: typeof catalogoFigurinhasTable.$inferSelect[] = [];

  for (let i = 0; i < quantidade; i++) {
    const pesoTotal = figurinhas.reduce(
      (sum, fig) => sum + (RARIDADE_PESO[fig.raridade] ?? 55),
      0
    );
    let rand = Math.random() * pesoTotal;
    let escolhida = figurinhas[0]!;
    for (const fig of figurinhas) {
      rand -= RARIDADE_PESO[fig.raridade] ?? 55;
      if (rand <= 0) {
        escolhida = fig;
        break;
      }
    }
    resultado.push(escolhida);
  }

  return resultado;
}

function getRaridadeColor(raridade: string): number {
  switch (raridade) {
    case "incomum":
      return 0x57f287;
    case "rara":
      return 0x5865f2;
    case "épica":
      return 0x470f78;
    case "lendária":
      return 0xf1c40f;
    default:
      return 0x99aab5;
  }
}
