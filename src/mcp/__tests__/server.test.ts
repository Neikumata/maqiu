import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { z } from "zod";

// ============================================================
// 测试 MCP Server 的工具注册、schema 校验和数据库连接
// ============================================================

// --- Mock MCP SDK ---
// 使用 vi.hoisted 提升到顶部，确保 mock 工厂函数可以访问
const { registeredTools, testDb, testClient, TEST_DB_PATH } = vi.hoisted(() => {
  // 收集注册的工具信息，用于后续断言
  const tools: Array<{
    name: string;
    description: string;
    schema: Record<string, unknown>;
  }> = [];

  const { resolve } = require("path");
  const { existsSync, mkdirSync, unlinkSync } = require("fs");
  const { dirname } = require("path");
  const { drizzle } = require("drizzle-orm/libsql");
  const { createClient } = require("@libsql/client");

  const dbPath = resolve(process.cwd(), "data", "test_mcp.db");

  // 清理残留的测试数据库
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch {
      /* 文件可能被锁定，忽略 */
    }
  }

  // 确保目录存在
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client);
  return {
    registeredTools: tools,
    testDb: db,
    testClient: client,
    TEST_DB_PATH: dbPath,
  };
});

// 模拟 McpServer 类，记录所有通过 server.tool() 注册的工具
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class {
      // 记录每次 tool 调用的工具名、描述和输入 schema
      tool(
        name: string,
        description: string,
        schema: Record<string, unknown>,
        _handler: unknown
      ) {
        registeredTools.push({ name, description, schema });
      }
      // connect 在测试中不需要真正执行
      async connect() {}
    },
  };
});

// 模拟 StdioServerTransport，避免真正打开 stdio 通道
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: class {
      async open() {}
      async close() {}
    },
  };
});

// 模拟 MCP 自己的数据库模块，让 server.ts 使用测试数据库
vi.mock("../db", () => ({
  db: testDb,
}));

// 导入 server.ts 以触发工具注册（因为 server.ts 顶层执行了注册逻辑）
import "../server";

// 导入 schema 以便在测试中使用
import {
  knowledgeNodes,
  knowledgeEdges,
  learningProgress,
  questions,
  examResults,
  examAnswers,
} from "@/lib/db/schema";

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

// 辅助函数：解析 zod schema 并验证输入数据
function parseSchema(
  schema: Record<string, unknown>,
  data: Record<string, unknown>
) {
  // 将 { key: z.string() } 形式转为 z.object({ key: z.string() })
  return z.object(schema as Record<string, z.ZodTypeAny>).safeParse(data);
}

// ============================================================
// 测试：MCP Server 工具注册
// ============================================================
describe("MCP Server 工具注册", () => {
  it("应该注册 15 个工具", () => {
    // 验证 server.ts 通过 server.tool() 注册的工具总数为 15
    expect(registeredTools).toHaveLength(15);
  });

  it("注册的工具名称应包含所有预期工具", () => {
    // 验证 14 个工具名全部正确注册
    const expectedNames = [
      "search_knowledge",
      "get_knowledge",
      "create_knowledge",
      "update_knowledge",
      "delete_knowledge",
      "link_knowledge",
      "unlink_knowledge",
      "get_learning_status",
      "update_learning_status",
      "get_recommended",
      "get_due_reviews",
      "list_questions",
      "create_question",
      "create_exam",
      "get_exam_stats",
    ];

    const actualNames = registeredTools.map((t) => t.name);
    expect(actualNames).toEqual(expectedNames);
  });

  it("每个工具都应有非空的描述", () => {
    // 验证所有注册的工具描述不为空
    for (const tool of registeredTools) {
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
    }
  });
});

// ============================================================
// 测试：MCP Server 工具输入 schema 校验
// ============================================================
describe("MCP Server 工具输入 schema 校验", () => {
  // 辅助函数：按工具名查找 schema
  function getSchema(name: string) {
    const tool = registeredTools.find((t) => t.name === name);
    expect(tool).toBeDefined();
    return tool!.schema;
  }

  describe("search_knowledge — 搜索知识节点", () => {
    it("不传参数时校验通过（query 可选）", () => {
      // query 是 optional，不传也应通过
      const schema = getSchema("search_knowledge");
      const result = parseSchema(schema, {});
      expect(result.success).toBe(true);
    });

    it("传入合法 query 时校验通过", () => {
      // 传入一个字符串 query，应通过
      const schema = getSchema("search_knowledge");
      const result = parseSchema(schema, { query: "TypeScript" });
      expect(result.success).toBe(true);
    });

    it("传入非字符串 query 时校验失败", () => {
      // query 必须是字符串，传数字应失败
      const schema = getSchema("search_knowledge");
      const result = parseSchema(schema, { query: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe("get_knowledge — 获取知识节点详情", () => {
    it("传入合法 id 时校验通过", () => {
      // id 为必填字符串
      const schema = getSchema("get_knowledge");
      const result = parseSchema(schema, { id: "some-uuid" });
      expect(result.success).toBe(true);
    });

    it("不传 id 时校验失败（id 必填）", () => {
      // id 是必填的，不传应失败
      const schema = getSchema("get_knowledge");
      const result = parseSchema(schema, {});
      expect(result.success).toBe(false);
    });
  });

  describe("create_knowledge — 创建知识节点", () => {
    it("只传 title 时校验通过（其他字段可选）", () => {
      // title 是必填，其他字段可选
      const schema = getSchema("create_knowledge");
      const result = parseSchema(schema, { title: "新知识" });
      expect(result.success).toBe(true);
    });

    it("传入完整参数时校验通过", () => {
      // 所有字段都传，应通过
      const schema = getSchema("create_knowledge");
      const result = parseSchema(schema, {
        title: "新知识",
        content: "内容",
        category: "分类",
        tags: ["标签1", "标签2"],
      });
      expect(result.success).toBe(true);
    });

    it("不传 title 时校验失败（title 必填）", () => {
      // title 是必填字段
      const schema = getSchema("create_knowledge");
      const result = parseSchema(schema, { content: "只有内容" });
      expect(result.success).toBe(false);
    });

    it("传入非数组的 tags 时校验失败", () => {
      // tags 必须是 string 数组
      const schema = getSchema("create_knowledge");
      const result = parseSchema(schema, { title: "测试", tags: "不是数组" });
      expect(result.success).toBe(false);
    });
  });

  describe("update_knowledge — 更新知识节点", () => {
    it("只传 id 时校验通过（其他字段可选）", () => {
      // id 必填，其他可选
      const schema = getSchema("update_knowledge");
      const result = parseSchema(schema, { id: "some-id" });
      expect(result.success).toBe(true);
    });

    it("不传 id 时校验失败", () => {
      // id 是必填的
      const schema = getSchema("update_knowledge");
      const result = parseSchema(schema, { title: "新标题" });
      expect(result.success).toBe(false);
    });
  });

  describe("delete_knowledge — 删除知识节点", () => {
    it("传入合法 id 时校验通过", () => {
      const schema = getSchema("delete_knowledge");
      const result = parseSchema(schema, { id: "some-id" });
      expect(result.success).toBe(true);
    });

    it("不传 id 时校验失败", () => {
      const schema = getSchema("delete_knowledge");
      const result = parseSchema(schema, {});
      expect(result.success).toBe(false);
    });
  });

  describe("link_knowledge — 建立知识关联", () => {
    it("传入完整合法参数时校验通过", () => {
      // sourceId、targetId、type 都是必填
      const schema = getSchema("link_knowledge");
      const result = parseSchema(schema, {
        sourceId: "a",
        targetId: "b",
        type: "prerequisite",
      });
      expect(result.success).toBe(true);
    });

    it("支持所有三种关联类型", () => {
      // 验证 prerequisite、related、builds_upon 三种类型都能通过
      const schema = getSchema("link_knowledge");
      for (const t of ["prerequisite", "related", "builds_upon"]) {
        const result = parseSchema(schema, {
          sourceId: "a",
          targetId: "b",
          type: t,
        });
        expect(result.success).toBe(true);
      }
    });

    it("传入非法关联类型时校验失败", () => {
      // type 必须是 enum 中的值
      const schema = getSchema("link_knowledge");
      const result = parseSchema(schema, {
        sourceId: "a",
        targetId: "b",
        type: "invalid_type",
      });
      expect(result.success).toBe(false);
    });

    it("缺少必填字段时校验失败", () => {
      const schema = getSchema("link_knowledge");
      const result = parseSchema(schema, { sourceId: "a" });
      expect(result.success).toBe(false);
    });
  });

  describe("unlink_knowledge — 删除知识关联", () => {
    it("传入合法 edgeId 时校验通过", () => {
      const schema = getSchema("unlink_knowledge");
      const result = parseSchema(schema, { edgeId: "some-edge-id" });
      expect(result.success).toBe(true);
    });

    it("不传 edgeId 时校验失败", () => {
      const schema = getSchema("unlink_knowledge");
      const result = parseSchema(schema, {});
      expect(result.success).toBe(false);
    });
  });

  describe("update_learning_status — 更新学习状态", () => {
    it("传入 nodeId 和 status 时校验通过", () => {
      const schema = getSchema("update_learning_status");
      const result = parseSchema(schema, {
        nodeId: "some-id",
        status: "learning",
      });
      expect(result.success).toBe(true);
    });

    it("支持所有四种学习状态", () => {
      // 验证四种枚举值都能通过
      const schema = getSchema("update_learning_status");
      for (const s of ["not_started", "learning", "mastered", "needs_review"]) {
        const result = parseSchema(schema, { nodeId: "id", status: s });
        expect(result.success).toBe(true);
      }
    });

    it("传入非法 status 时校验失败", () => {
      const schema = getSchema("update_learning_status");
      const result = parseSchema(schema, {
        nodeId: "id",
        status: "completed",
      });
      expect(result.success).toBe(false);
    });

    it("传入可选的 score 时校验通过", () => {
      const schema = getSchema("update_learning_status");
      const result = parseSchema(schema, {
        nodeId: "id",
        status: "mastered",
        score: 95,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("create_question — 创建题目", () => {
    it("传入最少必填字段时校验通过", () => {
      // nodeId、type、content、answer 是必填的
      const schema = getSchema("create_question");
      const result = parseSchema(schema, {
        nodeId: "id",
        type: "choice",
        content: "1+1=?",
        answer: "2",
      });
      expect(result.success).toBe(true);
    });

    it("支持所有三种题目类型", () => {
      const schema = getSchema("create_question");
      for (const t of ["choice", "fill", "short_answer"]) {
        const result = parseSchema(schema, {
          nodeId: "id",
          type: t,
          content: "题目",
          answer: "答案",
        });
        expect(result.success).toBe(true);
      }
    });

    it("传入非法题目类型时校验失败", () => {
      const schema = getSchema("create_question");
      const result = parseSchema(schema, {
        nodeId: "id",
        type: "essay",
        content: "题目",
        answer: "答案",
      });
      expect(result.success).toBe(false);
    });

    it("缺少 answer 时校验失败", () => {
      const schema = getSchema("create_question");
      const result = parseSchema(schema, {
        nodeId: "id",
        type: "choice",
        content: "题目",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// 测试：MCP 数据库连接
// ============================================================
describe("MCP 数据库连接", () => {
  beforeAll(async () => {
    // 在所有测试开始前创建表结构
    for (const stmt of CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await testClient.execute(stmt);
    }
  });

  beforeEach(async () => {
    // 每个测试前清空所有表（按外键依赖顺序删除）
    await testDb.delete(examAnswers);
    await testDb.delete(examResults);
    await testDb.delete(questions);
    await testDb.delete(learningProgress);
    await testDb.delete(knowledgeEdges);
    await testDb.delete(knowledgeNodes);
  });

  afterAll(async () => {
    // 测试结束后关闭连接并清理测试数据库文件
    testClient.close();
    await new Promise((r) => setTimeout(r, 200));
    const { existsSync, unlinkSync } = require("fs");
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

  it("db 对象能正常创建", () => {
    // 验证测试数据库连接对象存在且不是 null/undefined
    expect(testDb).toBeDefined();
    expect(testDb).not.toBeNull();
  });

  it("能执行简单查询（select from knowledgeNodes）", async () => {
    // 空表应返回空数组，验证查询不会报错
    const result = await testDb.select().from(knowledgeNodes);
    expect(result).toEqual([]);
  });

  it("插入数据后能查询到", async () => {
    // 插入一条记录后验证可以查询到
    const { randomUUID } = require("crypto");
    const id = randomUUID();
    const now = new Date();
    await testDb.insert(knowledgeNodes).values({
      id,
      title: "测试节点",
      createdAt: now,
      updatedAt: now,
    });

    const rows = await testDb.select().from(knowledgeNodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].title).toBe("测试节点");
  });
});
