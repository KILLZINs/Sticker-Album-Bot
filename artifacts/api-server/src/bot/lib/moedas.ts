import { db } from "@workspace/db";
import { moedasUsuarioTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

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
  await db
    .insert(moedasUsuarioTable)
    .values({ guildId, userId, username, saldo: 0, nivelRebirth: 0 })
    .onConflictDoNothing();
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
): Promise<number> {
  // Atomic upsert: insert the row if it doesn't exist, otherwise increment
  // the balance. RETURNING gives us the actual new saldo without a second
  // round-trip, and lets callers verify the operation succeeded.
  const [updated] = await db
    .insert(moedasUsuarioTable)
    .values({ guildId, userId, username, saldo: amount, nivelRebirth: 0 })
    .onConflictDoUpdate({
      target: [moedasUsuarioTable.guildId, moedasUsuarioTable.userId],
      set: {
        saldo: sql`${moedasUsuarioTable.saldo} + ${amount}`,
        username: sql`excluded.username`,
      },
    })
    .returning({ novoSaldo: moedasUsuarioTable.saldo });

  return updated.novoSaldo;
}

export async function deductMoedas(
  guildId: string,
  userId: string,
  username: string,
  amount: number
): Promise<number> {
  // Ensure the row exists before attempting the atomic deduction
  await upsertRow(guildId, userId, username);

  // Single atomic UPDATE: only succeeds when saldo >= amount, preventing
  // race conditions where two concurrent purchases both pass a pre-check.
  // Returns the new saldo so callers don't need a second round-trip.
  const [updated] = await db
    .update(moedasUsuarioTable)
    .set({ saldo: sql`${moedasUsuarioTable.saldo} - ${amount}` })
    .where(
      and(
        eq(moedasUsuarioTable.guildId, guildId),
        eq(moedasUsuarioTable.userId, userId),
        sql`${moedasUsuarioTable.saldo} >= ${amount}`
      )
    )
    .returning({ novoSaldo: moedasUsuarioTable.saldo });

  if (!updated) {
    // Row was not updated — balance was insufficient at the moment of the write
    const saldo = await getSaldo(guildId, userId);
    throw new Error(`Saldo insuficiente: tem ${saldo}, precisa de ${amount}`);
  }

  return updated.novoSaldo;
}

export async function setNivelRebirth(
  guildId: string,
  userId: string,
  username: string,
  nivel: number
): Promise<void> {
  await db
    .insert(moedasUsuarioTable)
    .values({ guildId, userId, username, saldo: 0, nivelRebirth: nivel })
    .onConflictDoUpdate({
      target: [moedasUsuarioTable.guildId, moedasUsuarioTable.userId],
      set: { nivelRebirth: nivel },
    });
}
