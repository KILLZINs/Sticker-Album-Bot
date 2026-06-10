import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Catálogo global do servidor — admins criam figurinhas aqui
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

// Coleção de cada usuário — figurinhas desbloqueadas do catálogo
export const colecaoUsuarioTable = pgTable(
  "colecao_usuario",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    catalogoId: integer("catalogo_id")
      .notNull()
      .references(() => catalogoFigurinhasTable.id, { onDelete: "cascade" }),
    desbloqueadoEm: timestamp("desbloqueado_em").notNull().defaultNow(),
  },
  (t) => [unique("colecao_unica").on(t.guildId, t.userId, t.catalogoId)]
);

// Controle de pacotinhos diários
export const pacotesDiariosTable = pgTable("pacotes_diarios", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  ultimaAbertura: timestamp("ultima_abertura").notNull().defaultNow(),
});

// Tabelas legadas — mantidas para compatibilidade
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
