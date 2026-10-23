import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), state: text("state").notNull(),
  revision: integer("revision").notNull().default(0), updatedAt: text("updated_at").notNull(),
  lockedBy: text("locked_by"), lockedUntil: integer("locked_until"),
}, table => [index("idx_projects_owner_updated").on(table.owner, table.updatedAt)]);
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), projectId: text("project_id").notNull(),
  status: text("status").notNull(), model: text("model"), tokens: integer("tokens"), createdAt: text("created_at").notNull(),
}, table => [index("idx_runs_project_owner").on(table.projectId, table.owner)]);
export const dailyUsage = sqliteTable("daily_usage", {
  owner: text("owner").notNull(), day: text("day").notNull(), calls: integer("calls").notNull().default(0),
}, table => [primaryKey({columns:[table.owner, table.day]})]);
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(), name: text("name"),
  passwordHash: text("password_hash"), salt: text("salt"), provider: text("provider").notNull().default("password"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_accounts_email").on(table.email)]);
