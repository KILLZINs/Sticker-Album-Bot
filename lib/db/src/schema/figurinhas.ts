import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const catalogoFigurinhasTable = pgTable("catalogo_figurinhas", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  criadoPorId: text("criado_por_id").notNull(),
  criadoPorUsername: text("criado_por_username").notNull(),
  imageUrl: text("image_url").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  raridade: text("raridade").notNull().default("comum"),
  numero: integer("numero").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const colecaoUsuarioTable = pgTable("colecao_usuario", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  catalogoId: integer("catalogo_id")
    .notNull()
    .references(() => catalogoFigurinhasTable.id, { onDelete: "cascade" }),
  desbloqueadoEm: timestamp("desbloqueado_em").notNull().defaultNow(),
});

export const moedasUsuarioTable = pgTable(
  "moedas_usuario",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    saldo: integer("saldo").notNull().default(0),
    nivelRebirth: integer("nivel_rebirth").notNull().default(0),
  },
  (t) => [unique("moedas_unicas").on(t.guildId, t.userId)]
);

export const conquistasUsuarioTable = pgTable(
  "conquistas_usuario",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    conquistaId: text("conquista_id").notNull(),
    ganhoEm: timestamp("ganho_em").notNull().defaultNow(),
  },
  (t) => [unique("conquista_unica").on(t.guildId, t.userId, t.conquistaId)]
);

export const pacotesDiariosTable = pgTable("pacotes_diarios", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  ultimaAbertura: timestamp("ultima_abertura").notNull().defaultNow(),
});

export const doacaoCooldownTable = pgTable(
  "doacao_cooldown",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    ultimaDoacao: timestamp("ultima_doacao").notNull().defaultNow(),
  },
  (t) => [unique("doacao_cooldown_unique").on(t.guildId, t.userId)]
);

export const figurinhasTable = pgTable("figurinhas", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  ownerId: text("owner_id").notNull(),
  ownerUsername: text("owner_username").notNull(),
  imageUrl: text("image_url").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  raridade: text("raridade").notNull().default("comum"),
  numero: integer("numero").notNull(),
  repetida: boolean("repetida").notNull().default(false),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const albumsTable = pgTable("albums", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  totalFigurinhas: integer("total_figurinhas").notNull().default(0),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});

export const insertCatalogoSchema = createInsertSchema(catalogoFigurinhasTable).omit({ id: true, criadoEm: true });
export const insertColecaoSchema = createInsertSchema(colecaoUsuarioTable).omit({ id: true, desbloqueadoEm: true });
export const insertFigurinhaSchema = createInsertSchema(figurinhasTable).omit({ id: true, criadoEm: true });
export const insertAlbumSchema = createInsertSchema(albumsTable).omit({ id: true, criadoEm: true, atualizadoEm: true });

export type CatalogoFigurinha = typeof catalogoFigurinhasTable.$inferSelect;
export type InsertCatalogo = z.infer<typeof insertCatalogoSchema>;
export type ColecaoUsuario = typeof colecaoUsuarioTable.$inferSelect;
export type InsertColecao = z.infer<typeof insertColecaoSchema>;
export type InsertFigurinha = z.infer<typeof insertFigurinhaSchema>;
export type Figurinha = typeof figurinhasTable.$inferSelect;
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;
export type Album = typeof albumsTable.$inferSelect;

export const emojiConfigTable = pgTable(
  "emoji_config",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    chave: text("chave").notNull(),
    emoji: text("emoji").notNull(),
  },
  (t) => [unique("emoji_config_unique").on(t.guildId, t.chave)]
);
export type EmojiConfig = typeof emojiConfigTable.$inferSelect;

export const moedaConfigTable = pgTable(
  "moeda_config",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
  },
  (t) => [unique("moeda_config_unique").on(t.guildId, t.chave)]
);
export type MoedaConfig = typeof moedaConfigTable.$inferSelect;

export const figurinhaConfigTable = pgTable(
  "figurinha_config",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
  },
  (t) => [unique("figurinha_config_unique").on(t.guildId, t.chave)]
);
export type FigurinhaConfig = typeof figurinhaConfigTable.$inferSelect;
