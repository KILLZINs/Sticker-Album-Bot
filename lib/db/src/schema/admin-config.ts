import { pgTable, serial, text, unique } from "drizzle-orm/pg-core";

export const adminConfigTable = pgTable(
  "admin_config",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
  },
  (t) => [unique("admin_config_unique").on(t.guildId, t.roleId)]
);
