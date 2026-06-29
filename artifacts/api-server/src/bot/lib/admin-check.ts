import { PermissionFlagsBits, GuildMember, PermissionsBitField } from "discord.js";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const SUPER_ADMIN_IDS = new Set(["1195254699943796791"]);

const cache = new Map<string, { roles: Set<string>; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function getAdminRoles(guildId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && now - cached.ts < TTL) return cached.roles;

  const rows = await db
    .select({ roleId: adminConfigTable.roleId })
    .from(adminConfigTable)
    .where(eq(adminConfigTable.guildId, guildId));

  const roles = new Set(rows.map((r) => r.roleId));
  cache.set(guildId, { roles, ts: now });
  return roles;
}

export function invalidateAdminCache(guildId: string): void {
  cache.delete(guildId);
  logger.info({ guildId }, "Cache de admin config invalidado");
}

// Tipo genérico que cobre ChatInputCommandInteraction, ButtonInteraction e ModalSubmitInteraction
export type AdminCheckable = {
  user: { id: string };
  guild: { ownerId: string } | null;
  member: GuildMember | Record<string, unknown> | null;
  guildId: string | null;
  memberPermissions: Readonly<PermissionsBitField> | null;
};

export async function isAdmin(interaction: AdminCheckable): Promise<boolean> {
  // Super-admins sempre passam
  if (SUPER_ADMIN_IDS.has(interaction.user.id)) return true;

  if (!interaction.guild || !interaction.member) return false;

  // Dono do servidor
  if (interaction.guild.ownerId === interaction.user.id) return true;

  // Permissões nativas do Discord
  const perms = interaction.memberPermissions;
  if (perms?.has(PermissionFlagsBits.Administrator)) return true;
  if (perms?.has(PermissionFlagsBits.ManageGuild)) return true;

  // Cargos configurados via /configurar-admin
  try {
    const adminRoles = await getAdminRoles(interaction.guildId!);
    if (adminRoles.size === 0) return false;

    const member = interaction.member as GuildMember;
    const memberRoleIds = member.roles?.cache
      ? [...member.roles.cache.keys()]
      : (member.roles as unknown as string[]);

    return memberRoleIds.some((rid) => adminRoles.has(rid));
  } catch {
    return false;
  }
}

export const ADMIN_DENY_MSG =
  "❌ **Sem permissão!** Este botão é apenas para administradores.\n\n" +
  "Se você deveria ter acesso, peça ao dono do servidor para configurar um cargo admin com `/configurar-admin adicionar`.";
