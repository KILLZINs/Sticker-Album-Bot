import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const emojiConfigTable = pgTable("emoji_config", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  chave: text("chave").notNull(),
  emoji: text("emoji").notNull(),
});
