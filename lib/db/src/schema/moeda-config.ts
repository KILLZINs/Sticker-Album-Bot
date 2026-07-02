import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const moedaConfigTable = pgTable("moeda_config", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  chave: text("chave").notNull(),
  valor: text("valor").notNull(),
});
