import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const knowledgeNodes = sqliteTable("knowledge_nodes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content", { mode: "json" }).$type<string>().default(""),
  category: text("category").default(""),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const knowledgeEdges = sqliteTable("knowledge_edges", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["prerequisite", "related", "builds_upon"],
  }).notNull(),
});

export const learningProgress = sqliteTable("learning_progress", {
  id: text("id").primaryKey(),
  nodeId: text("node_id")
    .notNull()
    .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["not_started", "learning", "mastered", "needs_review"],
  })
    .notNull()
    .default("not_started"),
  score: integer("score").default(0),
  reviewCount: integer("review_count").notNull().default(0),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp" }),
  nextReviewAt: integer("next_review_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  nodeId: text("node_id")
    .notNull()
    .references(() => knowledgeNodes.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["choice", "fill", "short_answer"],
  }).notNull(),
  content: text("content").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>().default([]),
  answer: text("answer").notNull(),
  explanation: text("explanation").default(""),
  difficulty: integer("difficulty").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const examResults = sqliteTable("exam_results", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  totalScore: integer("total_score").default(0),
  maxScore: integer("max_score").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const examAnswers = sqliteTable("exam_answers", {
  id: text("id").primaryKey(),
  examId: text("exam_id")
    .notNull()
    .references(() => examResults.id, { onDelete: "cascade" }),
  questionId: text("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  userAnswer: text("user_answer").default(""),
  correct: integer("correct", { mode: "boolean" }).notNull().default(false),
});
