import { describe, it, expect, beforeEach, afterAll, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import { sql, eq } from "drizzle-orm";
import * as schema from "../schema";
import { randomUUID } from "crypto";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

const {
  knowledgeNodes,
  knowledgeEdges,
  learningProgress,
  questions,
  examResults,
  examAnswers,
} = schema;

// 测试数据库文件路径（使用绝对路径避免工作目录问题）
const TEST_DB_PATH = resolve(process.cwd(), "data", "test.db");

// 建表 SQL（与 drizzle 迁移文件一致）
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
  CREATE TABLE IF NOT EXISTS knowledge_edges (
    id text PRIMARY KEY NOT NULL,
    source_id text NOT NULL,
    target_id text NOT NULL,
    type text NOT NULL,
    FOREIGN KEY (source_id) REFERENCES knowledge_nodes(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (target_id) REFERENCES knowledge_nodes(id) ON UPDATE no action ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS learning_progress (
    id text PRIMARY KEY NOT NULL,
    node_id text NOT NULL,
    status text DEFAULT 'not_started' NOT NULL,
    score integer DEFAULT 0,
    review_count integer DEFAULT 0 NOT NULL,
    last_reviewed_at integer,
    next_review_at integer,
    created_at integer NOT NULL,
    FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON UPDATE no action ON DELETE cascade
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

// 清理残留的测试数据库（忽略失败，可能是文件锁）
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

// 辅助函数：生成唯一 ID
function uid(): string {
  return randomUUID();
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
  await db.delete(learningProgress);
  await db.delete(knowledgeEdges);
  await db.delete(knowledgeNodes);
});

afterAll(async () => {
  // 测试结束后关闭连接并清理测试数据库文件
  // Windows 下 libsql 关闭后文件锁可能延迟释放，短暂等待后重试删除
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

describe("数据库连接", () => {
  it("能够成功连接并执行简单查询", async () => {
    // 验证数据库连接正常，可以通过执行简单的 select 查询来确认
    const result = await db.select().from(knowledgeNodes);
    expect(result).toEqual([]);
  });
});

describe("知识节点 (knowledge_nodes) CRUD", () => {
  it("能够插入一条知识节点", async () => {
    // 验证插入操作能正确写入数据
    const id = uid();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id,
      title: "TypeScript 基础",
      content: "TypeScript 是 JavaScript 的超集",
      category: "编程语言",
      tags: ["typescript", "javascript"],
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db.select().from(knowledgeNodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].title).toBe("TypeScript 基础");
    expect(rows[0].category).toBe("编程语言");
  });

  it("能够查询指定 ID 的知识节点", async () => {
    // 验证按 ID 查询能返回正确结果
    const id = uid();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id,
      title: "React 入门",
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("React 入门");
  });

  it("能够更新知识节点", async () => {
    // 验证更新操作能正确修改已有数据
    const id = uid();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id,
      title: "旧标题",
      content: "旧内容",
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(knowledgeNodes)
      .set({ title: "新标题", content: "新内容" })
      .where(eq(knowledgeNodes.id, id));

    const rows = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id));
    expect(rows[0].title).toBe("新标题");
    expect(rows[0].content).toBe("新内容");
  });

  it("能够删除知识节点", async () => {
    // 验证删除操作能正确移除数据
    const id = uid();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id,
      title: "待删除",
      createdAt: now,
      updatedAt: now,
    });

    await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id));

    const rows = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id));
    expect(rows).toHaveLength(0);
  });

  it("插入时 tags 和 content 默认值正确", async () => {
    // 验证 tags 和 content 字段的默认值
    const id = uid();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id,
      title: "测试默认值",
      createdAt: now,
      updatedAt: now,
    });

    const rows = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, id));
    expect(rows[0].content).toBe("");
    expect(rows[0].tags).toEqual([]);
    expect(rows[0].category).toBe("");
  });
});

describe("知识边 (knowledge_edges) CRUD", () => {
  // 每个测试需要的两个节点 ID
  let nodeA: string;
  let nodeB: string;
  const now = new Date();

  beforeEach(async () => {
    // 插入两个节点供边测试使用
    nodeA = uid();
    nodeB = uid();
    await db.insert(knowledgeNodes).values([
      { id: nodeA, title: "节点A", createdAt: now, updatedAt: now },
      { id: nodeB, title: "节点B", createdAt: now, updatedAt: now },
    ]);
  });

  it("能够插入一条知识边（建立关联）", async () => {
    // 验证边能正确建立两个节点之间的关联
    const edgeId = uid();
    await db.insert(knowledgeEdges).values({
      id: edgeId,
      sourceId: nodeA,
      targetId: nodeB,
      type: "prerequisite",
    });

    const rows = await db.select().from(knowledgeEdges);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceId).toBe(nodeA);
    expect(rows[0].targetId).toBe(nodeB);
    expect(rows[0].type).toBe("prerequisite");
  });

  it("能够查询指定节点的所有出边", async () => {
    // 验证能查询某个节点作为起点的所有边
    const nodeC = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeC,
      title: "节点C",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(knowledgeEdges).values([
      { id: uid(), sourceId: nodeA, targetId: nodeB, type: "related" },
      { id: uid(), sourceId: nodeA, targetId: nodeC, type: "builds_upon" },
    ]);

    const rows = await db
      .select()
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.sourceId, nodeA));
    expect(rows).toHaveLength(2);
  });

  it("能够删除一条知识边", async () => {
    // 验证删除操作能正确移除关联
    const edgeId = uid();
    await db.insert(knowledgeEdges).values({
      id: edgeId,
      sourceId: nodeA,
      targetId: nodeB,
      type: "related",
    });

    await db.delete(knowledgeEdges).where(eq(knowledgeEdges.id, edgeId));

    const rows = await db
      .select()
      .from(knowledgeEdges)
      .where(eq(knowledgeEdges.id, edgeId));
    expect(rows).toHaveLength(0);
  });
});

describe("学习进度 (learning_progress) CRUD", () => {
  let nodeId: string;
  const now = new Date();

  beforeEach(async () => {
    // 创建一个节点供进度测试使用
    nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "进度测试节点",
      createdAt: now,
      updatedAt: now,
    });
  });

  it("能够插入一条学习进度记录", async () => {
    // 验证进度记录能正确创建
    const id = uid();
    await db.insert(learningProgress).values({
      id,
      nodeId,
      status: "learning",
      score: 75,
    });

    const rows = await db.select().from(learningProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0].nodeId).toBe(nodeId);
    expect(rows[0].status).toBe("learning");
    expect(rows[0].score).toBe(75);
  });

  it("学习进度默认值为 not_started，reviewCount 默认为 0", async () => {
    // 验证默认字段值正确
    const id = uid();
    await db.insert(learningProgress).values({ id, nodeId });

    const rows = await db
      .select()
      .from(learningProgress)
      .where(eq(learningProgress.id, id));
    expect(rows[0].status).toBe("not_started");
    expect(rows[0].reviewCount).toBe(0);
    expect(rows[0].score).toBe(0);
  });

  it("能够更新学习状态", async () => {
    // 验证状态更新正确生效
    const id = uid();
    await db.insert(learningProgress).values({ id, nodeId });

    await db
      .update(learningProgress)
      .set({ status: "mastered", score: 100, reviewCount: 5 })
      .where(eq(learningProgress.id, id));

    const rows = await db
      .select()
      .from(learningProgress)
      .where(eq(learningProgress.id, id));
    expect(rows[0].status).toBe("mastered");
    expect(rows[0].score).toBe(100);
    expect(rows[0].reviewCount).toBe(5);
  });

  it("能够删除学习进度记录", async () => {
    // 验证删除操作正确移除进度记录
    const id = uid();
    await db.insert(learningProgress).values({ id, nodeId });

    await db.delete(learningProgress).where(eq(learningProgress.id, id));

    const rows = await db
      .select()
      .from(learningProgress)
      .where(eq(learningProgress.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("题目 (questions) CRUD", () => {
  let nodeId: string;
  const now = new Date();

  beforeEach(async () => {
    // 创建一个节点供题目测试使用
    nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "题目测试节点",
      createdAt: now,
      updatedAt: now,
    });
  });

  it("能够插入一道选择题", async () => {
    // 验证选择题能正确创建，包含选项
    const id = uid();
    await db.insert(questions).values({
      id,
      nodeId,
      type: "choice",
      content: "TypeScript 的类型系统属于什么类型？",
      options: ["静态类型", "动态类型", "无类型", "混合类型"],
      answer: "静态类型",
      difficulty: 2,
      createdAt: now,
    });

    const rows = await db.select().from(questions);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("choice");
    expect(rows[0].options).toEqual([
      "静态类型",
      "动态类型",
      "无类型",
      "混合类型",
    ]);
    expect(rows[0].difficulty).toBe(2);
  });

  it("能够插入一道填空题", async () => {
    // 验证填空题能正确创建
    const id = uid();
    await db.insert(questions).values({
      id,
      nodeId,
      type: "fill",
      content: "TypeScript 中用 _____ 关键字定义接口",
      answer: "interface",
      createdAt: now,
    });

    const rows = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    expect(rows[0].type).toBe("fill");
    expect(rows[0].answer).toBe("interface");
  });

  it("能够更新题目内容", async () => {
    // 验证题目更新正确生效
    const id = uid();
    await db.insert(questions).values({
      id,
      nodeId,
      type: "short_answer",
      content: "请简述闭包",
      answer: "旧答案",
      createdAt: now,
    });

    await db
      .update(questions)
      .set({ answer: "闭包是函数与其词法环境的组合" })
      .where(eq(questions.id, id));

    const rows = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    expect(rows[0].answer).toBe("闭包是函数与其词法环境的组合");
  });

  it("能够删除题目", async () => {
    // 验证删除操作正确移除题目
    const id = uid();
    await db.insert(questions).values({
      id,
      nodeId,
      type: "choice",
      content: "待删除的题目",
      answer: "A",
      createdAt: now,
    });

    await db.delete(questions).where(eq(questions.id, id));

    const rows = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("考试记录 (exam_results + exam_answers) CRUD", () => {
  it("能够插入一条考试记录", async () => {
    // 验证考试记录能正确创建
    const id = uid();
    const now = new Date();
    await db.insert(examResults).values({
      id,
      title: "TypeScript 单元测试",
      totalScore: 85,
      maxScore: 100,
      createdAt: now,
    });

    const rows = await db.select().from(examResults);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("TypeScript 单元测试");
    expect(rows[0].totalScore).toBe(85);
  });

  it("能够插入考试作答记录并关联题目和考试", async () => {
    // 验证考试作答记录能正确关联到考试和题目
    const now = new Date();

    // 先创建节点、题目、考试
    const nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "考试测试节点",
      createdAt: now,
      updatedAt: now,
    });

    const qId = uid();
    await db.insert(questions).values({
      id: qId,
      nodeId,
      type: "choice",
      content: "1+1=?",
      options: ["1", "2", "3", "4"],
      answer: "2",
      createdAt: now,
    });

    const examId = uid();
    await db.insert(examResults).values({
      id: examId,
      title: "数学小测",
      createdAt: now,
    });

    // 插入作答记录
    const answerId = uid();
    await db.insert(examAnswers).values({
      id: answerId,
      examId,
      questionId: qId,
      userAnswer: "2",
      correct: true,
    });

    const rows = await db.select().from(examAnswers);
    expect(rows).toHaveLength(1);
    expect(rows[0].userAnswer).toBe("2");
    expect(rows[0].correct).toBe(true);
  });

  it("能够删除考试记录", async () => {
    // 验证删除考试记录正确生效
    const id = uid();
    const now = new Date();
    await db.insert(examResults).values({
      id,
      title: "待删除考试",
      createdAt: now,
    });

    await db.delete(examResults).where(eq(examResults.id, id));

    const rows = await db
      .select()
      .from(examResults)
      .where(eq(examResults.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("外键约束（级联删除）", () => {
  it("删除知识节点时，关联的边应被级联删除", async () => {
    // 验证 onDelete: cascade 生效：删除节点后，关联的边应自动消失
    const now = new Date();
    const nodeA = uid();
    const nodeB = uid();
    await db.insert(knowledgeNodes).values([
      { id: nodeA, title: "源节点", createdAt: now, updatedAt: now },
      { id: nodeB, title: "目标节点", createdAt: now, updatedAt: now },
    ]);

    const edgeId = uid();
    await db.insert(knowledgeEdges).values({
      id: edgeId,
      sourceId: nodeA,
      targetId: nodeB,
      type: "prerequisite",
    });

    // 确认边已存在
    let edges = await db.select().from(knowledgeEdges);
    expect(edges).toHaveLength(1);

    // 删除源节点
    await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, nodeA));

    // 关联的边应该已被级联删除
    edges = await db.select().from(knowledgeEdges);
    expect(edges).toHaveLength(0);
  });

  it("删除知识节点时，关联的学习进度应被级联删除", async () => {
    // 验证删除节点后，关联的学习进度记录自动消失
    const now = new Date();
    const nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "进度关联测试",
      createdAt: now,
      updatedAt: now,
    });

    const progressId = uid();
    await db.insert(learningProgress).values({
      id: progressId,
      nodeId,
      status: "learning",
    });

    // 确认进度记录已存在
    let progress = await db.select().from(learningProgress);
    expect(progress).toHaveLength(1);

    // 删除节点
    await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, nodeId));

    // 关联的进度记录应该已被级联删除
    progress = await db.select().from(learningProgress);
    expect(progress).toHaveLength(0);
  });

  it("删除知识节点时，关联的题目应被级联删除", async () => {
    // 验证删除节点后，关联的题目自动消失
    const now = new Date();
    const nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "题目关联测试",
      createdAt: now,
      updatedAt: now,
    });

    const qId = uid();
    await db.insert(questions).values({
      id: qId,
      nodeId,
      type: "choice",
      content: "会被级联删除的题目",
      answer: "A",
      createdAt: now,
    });

    // 确认题目已存在
    let qs = await db.select().from(questions);
    expect(qs).toHaveLength(1);

    // 删除节点
    await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, nodeId));

    // 关联的题目应该已被级联删除
    qs = await db.select().from(questions);
    expect(qs).toHaveLength(0);
  });

  it("删除考试记录时，关联的作答记录应被级联删除", async () => {
    // 验证删除考试后，关联的作答记录自动消失
    const now = new Date();

    // 创建节点和题目
    const nodeId = uid();
    await db.insert(knowledgeNodes).values({
      id: nodeId,
      title: "考试级联测试节点",
      createdAt: now,
      updatedAt: now,
    });

    const qId = uid();
    await db.insert(questions).values({
      id: qId,
      nodeId,
      type: "choice",
      content: "测试题目",
      answer: "A",
      createdAt: now,
    });

    const examId = uid();
    await db.insert(examResults).values({
      id: examId,
      title: "级联删除测试考试",
      createdAt: now,
    });

    const answerId = uid();
    await db.insert(examAnswers).values({
      id: answerId,
      examId,
      questionId: qId,
      userAnswer: "A",
      correct: true,
    });

    // 确认作答记录已存在
    let answers = await db.select().from(examAnswers);
    expect(answers).toHaveLength(1);

    // 删除考试
    await db.delete(examResults).where(eq(examResults.id, examId));

    // 关联的作答记录应该已被级联删除
    answers = await db.select().from(examAnswers);
    expect(answers).toHaveLength(0);
  });
});
