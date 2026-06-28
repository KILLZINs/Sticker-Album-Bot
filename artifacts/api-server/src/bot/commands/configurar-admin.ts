import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { invalidateAdminCache } from "../lib/admin-check.js";

export const data = new SlashCommandBuilder()
  .setName("configurar-admin")
  .setDescription("[DONO/ADMIN] Gerencia os cargos com permissão de admin no bot")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("adicionar")
      .setDescription("Adiciona um cargo como admin do bot")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a adicionar").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remover")
      .setDescription("Remove um cargo da lista de admins do bot")
      .addRoleOption((opt) =>
        opt.setName("cargo").setDescription("Cargo a remover").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("listar").setDescription("Lista todos os cargos admin configurados")
  )
  .addSubcommand((sub) =>
    sub.setName("limpar").setDescription("Remove todos os cargos admin configurados (somente dono)")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();
  const isOwner = interaction.guild?.ownerId === interaction.user.id;
  const perms = interaction.memberPermissions;
  const hasAdminPerm = perms?.has(PermissionFlagsBits.Administrator) ?? false;

  // /limpar é exclusivo do dono ou Administrador
  if (sub === "limpar" && !isOwner && !hasAdminPerm) {
    await interaction.editReply("❌ Somente o **dono do servidor** ou alguém com permissão **Administrador** pode limpar todos os cargos admin.");
    return;
  }

  try {
    if (sub === "adicionar") {
      const role = interaction.options.getRole("cargo", true);

      // Não permite adicionar @everyone
      if (role.id === guildId) {
        await interaction.editReply("❌ Não é possível adicionar **@everyone** como cargo admin.");
        return;
      }

      await db
        .insert(adminConfigTable)
        .values({ guildId, roleId: role.id })
        .onConflictDoNothing();
      invalidateAdminCache(guildId);

      await interaction.editReply(
        `✅ Cargo **${role.name}** adicionado como admin do bot!\n\n` +
        `Membros com esse cargo agora podem usar todos os comandos de admin.\n` +
        `> Use \`/configurar-admin listar\` para ver todos os cargos configurados.`
      );
    } else if (sub === "remover") {
      const role = interaction.options.getRole("cargo", true);
      const deleted = await db
        .delete(adminConfigTable)
        .where(and(eq(adminConfigTable.guildId, guildId), eq(adminConfigTable.roleId, role.id)))
        .returning({ id: adminConfigTable.id });
      invalidateAdminCache(guildId);

      if (deleted.length === 0) {
        await interaction.editReply(`⚠️ O cargo **${role.name}** não estava na lista de admins do bot.`);
      } else {
        await interaction.editReply(`✅ Cargo **${role.name}** removido dos admins do bot.`);
      }
    } else if (sub === "listar") {
      const rows = await db
        .select({ roleId: adminConfigTable.roleId })
        .from(adminConfigTable)
        .where(eq(adminConfigTable.guildId, guildId));

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Cargos Admin do Bot")
        .setColor(0x7B2FBE)
        .setTimestamp();

      if (rows.length === 0) {
        embed.setDescription(
          "Nenhum cargo configurado.\n\n" +
          "Somente usuários com **Gerenciar Servidor** ou **Administrador** têm acesso aos comandos admin.\n\n" +
          "Use `/configurar-admin adicionar` para liberar acesso a um cargo específico."
        );
      } else {
        embed.setDescription(
          `**${rows.length} cargo(s) com acesso admin:**\n\n` +
          rows.map((r) => `• <@&${r.roleId}>`).join("\n") +
          `\n\n*(Usuários com Gerenciar Servidor ou Administrador também têm acesso)*`
        );
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === "limpar") {
      const deleted = await db
        .delete(adminConfigTable)
        .where(eq(adminConfigTable.guildId, guildId))
        .returning({ id: adminConfigTable.id });
      invalidateAdminCache(guildId);

      await interaction.editReply(
        `✅ **${deleted.length} cargo(s)** removidos.\n\n` +
        `Agora somente usuários com **Gerenciar Servidor** ou **Administrador** têm acesso aos comandos admin.`
      );
    }
  } catch (err) {
    logger.error({ err }, "Erro ao configurar admin");
    await interaction.editReply(
      "❌ Erro ao executar. Certifique-se de que a tabela `admin_config` existe no banco de dados.\n\n" +
      "SQL para criar:\n```sql\nCREATE TABLE IF NOT EXISTS admin_config (\n  id SERIAL PRIMARY KEY,\n  guild_id TEXT NOT NULL,\n  role_id TEXT NOT NULL,\n  CONSTRAINT admin_config_unique UNIQUE (guild_id, role_id)\n);\n```"
    );
  }
}
