import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";

export const bolaoTable = pgTable("bolao", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  criadorId: text("criador_id").notNull(),
  time1: text("time1").notNull(),
  time2: text("time2").notNull(),
  golTime1: integer("gol_time1"),
  golTime2: integer("gol_time2"),
  valorMinimo: integer("valor_minimo").notNull(),
  premio: integer("premio"),
  tipo: text("tipo").notNull(),
  encerraEm: timestamp("encerra_em").notNull(),
  encerrado: boolean("encerrado").notNull().default(false),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const palpitesBolaoTable = pgTable(
  "palpites_bolao",
  {
    id: serial("id").primaryKey(),
    bolaoId: integer("bolao_id")
      .notNull()
      .references(() => bolaoTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    golTime1: integer("gol_time1").notNull(),
    golTime2: integer("gol_time2").notNull(),
    apostado: integer("apostado").notNull(),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
  },
  (t) => [unique("palpite_unico").on(t.bolaoId, t.userId)]
);
