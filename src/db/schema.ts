import { relations } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  image: text("image"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultLanguage: text("default_language", { enum: ["zh", "en"] })
    .default("zh")
    .notNull(),
  dailyCount: integer("daily_count").default(3).notNull(),
  timeZone: text("time_zone").default("Asia/Shanghai").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    language: text("language", { enum: ["zh", "en"] }).notNull(),
    category: text("category").notNull(),
    date: date("date").notNull(),
    index: integer("exercise_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("exercises_date_language_index_unique").on(
      table.date,
      table.language,
      table.index,
    ),
  ],
);

export const exerciseGenerationLocks = pgTable(
  "exercise_generation_locks",
  {
    date: date("date").notNull(),
    language: text("language", { enum: ["zh", "en"] }).notNull(),
    ownerToken: uuid("owner_token").notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.date, table.language] })],
);

export const userProgress = pgTable(
  "user_progress",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "completed"] })
      .default("pending")
      .notNull(),
    audioUrl: text("audio_url"),
    score: integer("score"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("user_progress_user_id_exercise_id_unique").on(
      table.userId,
      table.exerciseId,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  progress: many(userProgress),
}));

export const exercisesRelations = relations(exercises, ({ many }) => ({
  progress: many(userProgress),
}));

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, {
    fields: [userProgress.userId],
    references: [users.id],
  }),
  exercise: one(exercises, {
    fields: [userProgress.exerciseId],
    references: [exercises.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

export type UserProgress = typeof userProgress.$inferSelect;
export type NewUserProgress = typeof userProgress.$inferInsert;
