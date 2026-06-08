import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { z } from "zod";
import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

const {
  knowledgeNodes,
  questions,
  examResults,
  examAnswers,
} = schema;

// 测试数据库文件路径（使用独立文件，避免与其他测试冲突）
const TEST_DB_PATH = resolve(process.cwd(), "data", "test_create_exam.db");

// 建表 SQL（与 drizzle 迁移文件一致，只包含 create_exam 涉及的表）
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    content text DEFAULT '',
    category text DEFAULT '',
    tags text DEFAULT '[]',
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id text PRIMARY KEY NOT NULL,
    node_id text NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    options text DEFAULT '[]',
    answer text NOT NULL,
    explanation text DEFAULT '',
    difficulty integer DEFAULT 1 NOT NULL,
    created_at integer NOT NULL,
    FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON UPDATE no action ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS exam_results (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    total_score integer DEFAULT 0,
    max_score integer DEFAULT 0,
    created_at integer NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exam_answers (
    id text PRIMARY KEY NOT NULL,
    exam_id text NOT NULL,
    question_id text NOT NULL,
    user_answer text DEFAULT '',
    correct integer DEFAULT false NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exam_results(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON UPDATE no action ON DELETE cascade
  );
`;

// 清理残留的测试数据库
if (existsSync(TEST_DB_PATH)) {
  try { unlinkSync(TEST_DB_PATH); } catch { /* 文件可能被锁定，忽略 */ }
}

// 确保目录存在
const dir = dirname(TEST_DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// 创建独立的测试数据库连接
const client: Client = createClient({ url: `file:${TEST_DB_PATH}` });
const db = drizzle(client, { schema });

// create_exam 工具的输入 schema（与 server.ts 中的定义一致）
const createExamSchema = {
  title: z.string(),
  questionIds: z.array(z.string()),
};

// create_exam 工具的核心逻辑（与 server.ts 中的实现一致，使用测试数据库）
async function createExamHandler(
  title: string,
  questionIds: string[]
) {
  if (questionIds.length === 0) {
    return { content: [{ type: "text" as const, text: "No questions selected" }] };
  }
  const examId = randomUUID();
  const maxScore = questionIds.length * 10;
  await db.insert(examResults).values({
    id: examId, title, totalScore: 0, maxScore, createdAt: new Date(),
  });
  for (const qId of questionIds) {
    await db.insert(examAnswers).values({
      id: randomUUID(), examId, questionId: qId, userAnswer: "", correct: false,
    });
  }
  return {
    content: [{
      type: "text" as const,
      text: `Exam created: ${title} (${questionIds.length} questions, ${maxScore} max score)\nExam ID: ${examId}`,
    }],
  };
}

// 辅助函数：解析 zod schema 并验证输入数据
function parseSchema(
  schemaObj: Record<string, unknown>,
  data: Record<string, unknown>
) {
  return z.object(schemaObj as Record<string, z.ZodTypeAny>).safeParse(data);
}

beforeAll(async () => {
  // 在所有测试开始前创建表结构
  for (const stmt of CREATE_TABLES_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await client.execute(stmt);
  }
});

beforeEach(async () => {
  // 每个测试前清空所有表（按外键依赖顺序删除）
  await db.delete(examAnswers);
  await db.delete(examResults);
  await db.delete(questions);
  await db.delete(knowledgeNodes);
});

afterAll(async () => {
  // 测试结束后关闭连接并清理测试数据库文件
  client.close();
  await new Promise((r) => setTimeout(r, 200));
  if (existsSync(TEST_DB_PATH)) {
    for (let i = 0; i < 5; i++) {
      try {
        unlinkSync(TEST_DB_PATH);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
});

// ============================================================
// 测试：create_exam 输入 schema 校验
// ============================================================
describe("create_exam 输入 schema 校验", () => {
  it("传入合法的 title 和 questionIds 时校验通过", () => {
    // title 和 questionIds 都是必填，类型正确时应通过
    const result = parseSchema(createExamSchema, {
      title: "期中考试",
      questionIds: ["q1", "q2", "q3"],
    });
    expect(result.success).toBe(true);
  });

  it("不传 title 时校验失败（title 必填）", () => {
    // title 是必填字段，缺少时应失败
    const result = parseSchema(createExamSchema, {
      questionIds: ["q1"],
    });
    expect(result.success).toBe(false);
  });

  it("不传 questionIds 时校验失败（questionIds 必填）", () => {
    // questionIds 是必填字段，缺少时应失败
    const result = parseSchema(createExamSchema, {
      title: "期中考试",
    });
    expect(result.success).toBe(false);
  });

  it("两个必填字段都不传时校验失败", () => {
    // title 和 questionIds 都不传，应失败
    const result = parseSchema(createExamSchema, {});
    expect(result.success).toBe(false);
  });

  it("questionIds 传入非数组时校验失败", () => {
    // questionIds 必须是 string[]，传入字符串应失败
    const result = parseSchema(createExamSchema, {
      title: "期中考试",
      questionIds: "not-an-array",
    });
    expect(result.success).toBe(false);
  });

  it("questionIds 传入数字数组时校验失败（必须是字符串数组）", () => {
    // questionIds 的元素必须是 string，传数字应失败
    const result = parseSchema(createExamSchema, {
      title: "期中考试",
      questionIds: [1, 2, 3],
    });
    expect(result.success).toBe(false);
  });

  it("questionIds 传入空数组时校验通过（schema 层面允许空数组）", () => {
    // zod schema 层面，z.array(z.string()) 允许空数组
    // 但 handler 中会检查空数组并返回提示信息
    const result = parseSchema(createExamSchema, {
      title: "期中考试",
      questionIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("title 传入非字符串时校验失败", () => {
    // title 必须是 string，传数字应失败
    const result = parseSchema(createExamSchema, {
      title: 123,
      questionIds: ["q1"],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 测试：create_exam 数据库逻辑
// ============================================================
describe("create_exam 数据库逻辑", () => {
  it("空的 questionIds 数组应返回提示信息，不写入数据库", async () => {
    // 模拟 handler 中 questionIds 为空的情况
    const result = await createExamHandler("空考试", []);

    // 返回的文本应包含提示信息
    expect(result.content[0].text).toBe("No questions selected");

    // 数据库中不应有考试记录
    const exams = await db.select().from(examResults);
    expect(exams).toHaveLength(0);
  });

  it("创建考试后 examResults 表应有一条记录，title 和 maxScore 正确", async () => {
    // 先创建必要的知识节点和题目（满足外键约束）
    const now = new Date();
    const nodeId = randomUUID();
    await db.insert(knowledgeNodes).values({
      id: nodeId, title: "考试测试节点", createdAt: now, updatedAt: now,
    });

    const q1 = randomUUID();
    const q2 = randomUUID();
    const q3 = randomUUID();
    await db.insert(questions).values([
      { id: q1, nodeId, type: "choice", content: "题目1", answer: "A", createdAt: now },
      { id: q2, nodeId, type: "fill", content: "题目2", answer: "答案", createdAt: now },
      { id: q3, nodeId, type: "short_answer", content: "题目3", answer: "简答", createdAt: now },
    ]);

    // 调用 create_exam 逻辑
    await createExamHandler("TypeScript 期中考试", [q1, q2, q3]);

    // 验证 examResults 表有一条记录
    const exams = await db.select().from(examResults);
    expect(exams).toHaveLength(1);
    expect(exams[0].title).toBe("TypeScript 期中考试");
    expect(exams[0].maxScore).toBe(30); // 3 * 10 = 30
  });

  it("创建考试后 examAnswers 表应有对应数量的记录（每个 questionId 一条）", async () => {
    // 先创建知识节点和 2 道题目
    const now = new Date();
    const nodeId = randomUUID();
    await db.insert(knowledgeNodes).values({
      id: nodeId, title: "答案数量测试节点", createdAt: now, updatedAt: now,
    });

    const q1 = randomUUID();
    const q2 = randomUUID();
    await db.insert(questions).values([
      { id: q1, nodeId, type: "choice", content: "题目1", answer: "A", createdAt: now },
      { id: q2, nodeId, type: "fill", content: "题目2", answer: "答案", createdAt: now },
    ]);

    // 创建考试，包含 2 道题
    await createExamHandler("两题考试", [q1, q2]);

    // 验证 examAnswers 表有 2 条记录
    const answers = await db.select().from(examAnswers);
    expect(answers).toHaveLength(2);

    // 验证每条记录的 questionId 包含在传入的列表中
    const answerQuestionIds = answers.map((a) => a.questionId);
    expect(answerQuestionIds).toContain(q1);
    expect(answerQuestionIds).toContain(q2);
  });

  it("maxScore 应等于 questionIds.length * 10", async () => {
    // 测试不同数量的题目对应的 maxScore
    const now = new Date();
    const nodeId = randomUUID();
    await db.insert(knowledgeNodes).values({
      id: nodeId, title: "分数测试节点", createdAt: now, updatedAt: now,
    });

    // 创建 5 道题目
    const questionIds = [];
    for (let i = 0; i < 5; i++) {
      const qId = randomUUID();
      questionIds.push(qId);
      await db.insert(questions).values({
        id: qId, nodeId, type: "choice", content: `题目${i + 1}`, answer: "A", createdAt: now,
      });
    }

    // 创建考试
    await createExamHandler("五题考试", questionIds);

    // 验证 maxScore = 5 * 10 = 50
    const exams = await db.select().from(examResults);
    expect(exams).toHaveLength(1);
    expect(exams[0].maxScore).toBe(50);
  });

  it("totalScore 初始应为 0", async () => {
    // 验证新创建的考试 totalScore 为 0
    const now = new Date();
    const nodeId = randomUUID();
    await db.insert(knowledgeNodes).values({
      id: nodeId, title: "总分测试节点", createdAt: now, updatedAt: now,
    });

    const q1 = randomUUID();
    await db.insert(questions).values({
      id: q1, nodeId, type: "choice", content: "题目1", answer: "A", createdAt: now,
    });

    await createExamHandler("总分测试", [q1]);

    const exams = await db.select().from(examResults);
    expect(exams).toHaveLength(1);
    expect(exams[0].totalScore).toBe(0);
  });

  it("examAnswers 中每条记录的 userAnswer 应为空字符串，correct 应为 false", async () => {
    // 验证初始作答记录的状态
    const now = new Date();
    const nodeId = randomUUID();
    await db.insert(knowledgeNodes).values({
      id: nodeId, title: "作答状态测试节点", createdAt: now, updatedAt: now,
    });

    const q1 = randomUUID();
    await db.insert(questions).values({
      id: q1, nodeId, type: "choice", content: "题目1", answer: "A", createdAt: now,
    });

    await createExamHandler("作答状态测试", [q1]);

    const answers = await db.select().from(examAnswers);
    expect(answers).toHaveLength(1);
    expect(answers[0].userAnswer).toBe("");
    expect(answers[0].correct).toBe(false);
  });
});
