import { db } from "@workspace/db";
import { moedasUsuarioTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// Nomes e descontos por nível de rebirth
export const NIVEL_NOME = ["✨ Normal", "🥈 Prata", "🥇 Ouro"] as const;
export const DESCONTO_NIVEL = [1.0, 0.8, 0.6] as const;
export const MAX_NIVEL = 2;

// Preços base dos pacotes
export const PACKS = {
  standard: { nome: "Standard", emoji: "📦", figurinhas: 3, precoBase: 300 },
  deluxe: { nome: "Deluxe", emoji: "🎁", figurinhas: 5, precoBase: 500 },
  ultimate: { nome: "Ultimate", emoji: "⭐", figurinhas: 10, precoBase: 1000 },
} as const;

export type TipoPacote = keyof typeof PACKS;

export function calcularPreco(precoBase: number, nivel: number): number {
  const desconto = DESCONTO_NIVEL[nivel] ?? 1.0;
  return Math.round(precoBase * desconto);
}

async function upsertRow(guildId: string, userId: string, username: string) {
  const existing = await db
    .select({ id: moedasUsuarioTable.id })
    .from(moedasUsuarioTable)
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    await db
      .insert(moedasUsuarioTable)
      .values({ guildId, userId, username, saldo: 0, nivelRebirth: 0 });
  }
}

export async function getSaldo(guildId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ saldo: moedasUsuarioTable.saldo })
    .from(moedasUsuarioTable)
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)))
    .limit(1);
  return row?.saldo ?? 0;
}

export async function getNivelRebirth(guildId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ nivel: moedasUsuarioTable.nivelRebirth })
    .from(moedasUsuarioTable)
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)))
    .limit(1);
  return row?.nivel ?? 0;
}

export async function addMoedas(
  guildId: string,
  userId: string,
  username: string,
  amount: number
): Promise<void> {
  // Tenta atualizar a linha existente primeiro
  const updated = await db
    .update(moedasUsuarioTable)
    .set({
      saldo: sql`${moedasUsuarioTable.saldo} + ${amount}`,
      username,
    })
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)))
    .returning({ id: moedasUsuarioTable.id });

  // Se não havia linha, insere uma nova
  if (updated.length === 0) {
    await db
      .insert(moedasUsuarioTable)
      .values({ guildId, userId, username, saldo: amount, nivelRebirth: 0 });
  }
}

export async function deductMoedas(
  guildId: string,
  userId: string,
  username: string,
  amount: number
): Promise<void> {
  await upsertRow(guildId, userId, username);
  const saldo = await getSaldo(guildId, userId);
  if (saldo < amount) {
    throw new Error(`Saldo insuficiente: tem ${saldo}, precisa de ${amount}`);
  }
  await db
    .update(moedasUsuarioTable)
    .set({ saldo: sql`${moedasUsuarioTable.saldo} - ${amount}` })
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)));
}

export async function setNivelRebirth(
  guildId: string,
  userId: string,
  username: string,
  nivel: number
): Promise<void> {
  // Tenta atualizar a linha existente primeiro
  const updated = await db
    .update(moedasUsuarioTable)
    .set({ nivelRebirth: nivel })
    .where(and(eq(moedasUsuarioTable.guildId, guildId), eq(moedasUsuarioTable.userId, userId)))
    .returning({ id: moedasUsuarioTable.id });

  // Se não havia linha, insere uma nova
  if (updated.length === 0) {
    await db
      .insert(moedasUsuarioTable)
      .values({ guildId, userId, username, saldo: 0, nivelRebirth: nivel });
  }
}
