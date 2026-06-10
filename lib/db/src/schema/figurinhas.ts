import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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

export const insertFigurinhaSchema = createInsertSchema(figurinhasTable).omit({ id: true, criadoEm: true });
export const insertAlbumSchema = createInsertSchema(albumsTable).omit({ id: true, criadoEm: true, atualizadoEm: true });

export type InsertFigurinha = z.infer<typeof insertFigurinhaSchema>;
export type Figurinha = typeof figurinhasTable.$inferSelect;
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;
export type Album = typeof albumsTable.$inferSelect;
