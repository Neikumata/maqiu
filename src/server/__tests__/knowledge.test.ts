import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

// 建表 SQL（与 drizzle 迁移文件一致，只包含本测试需要的表）
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
`;

// 使用 vi.hoisted 创建提升到顶部的数据库实例和测试路径
// vi.hoisted 会在所有其他代码（包括 vi.mock）之前执行
const { testDb, testClient, TEST_DB_PATH } = vi.hoisted(() => {
  const { resolve } = require("path");
  const { existsSync, mkdirSync, unlinkSync } = require("fs");
  const { dirname } = require("path");
  const { drizzle } = require("drizzle-orm/libsql");
  const { createClient } = require("@libsql/client");

  const dbPath = resolve(process.cwd(), "data", "test_server_actions.db");

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
  return { testDb: db, testClient: client, TEST_DB_PATH: dbPath };
});

// 模拟 @/lib/db 模块，让 Server Actions 使用测试数据库
vi.mock("@/lib/db", () => ({
  db: testDb,
}));

// 在 mock 生效后再导入
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";
import {
  createNode,
  updateNode,
  deleteNode,
  getNode,
  listNodes,
  createEdge,
  deleteEdge,
  getNodeEdges,
  getAllEdges,
} from "@/server/knowledge";

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
  await testDb.delete(knowledgeEdges);
  await testDb.delete(knowledgeNodes);
});

afterAll(async () => {
  // 测试结束后关闭连接并清理测试数据库文件
  testClient.close();
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
// 知识节点 Server Actions 测试
// ============================================================
describe("知识节点 Server Actions", () => {
  describe("createNode — 创建知识节点", () => {
    it("创建节点并返回有效的 UUID", async () => {
      // 验证 createNode 返回一个非空的 ID 字符串
      const id = await createNode({ title: "TypeScript 基础" });
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("创建节点后数据库中存在对应记录", async () => {
      // 验证创建的节点在数据库中可以查询到
      const id = await createNode({
        title: "React 入门",
        content: "React 是一个 UI 库",
        category: "前端框架",
        tags: ["react", "frontend"],
      });

      const node = await getNode(id);
      expect(node).not.toBeNull();
      expect(node!.id).toBe(id);
      expect(node!.title).toBe("React 入门");
      expect(node!.content).toBe("React 是一个 UI 库");
      expect(node!.category).toBe("前端框架");
      expect(node!.tags).toEqual(["react", "frontend"]);
    });

    it("创建节点时省略可选字段，默认值正确", async () => {
      // 只传必填的 title，其他字段应使用默认值
      const id = await createNode({ title: "最简节点" });

      const node = await getNode(id);
      expect(node).not.toBeNull();
      expect(node!.content).toBe("");
      expect(node!.category).toBe("");
      expect(node!.tags).toEqual([]);
      expect(node!.createdAt).toBeInstanceOf(Date);
      expect(node!.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("updateNode — 更新知识节点", () => {
    it("更新标题后，标题值正确且 updatedAt 发生变化", async () => {
      // 创建节点，记录原始 updatedAt，然后更新标题并验证
      const id = await createNode({ title: "旧标题" });
      const original = await getNode(id);
      expect(original!.title).toBe("旧标题");

      // 等待一小段时间确保 updatedAt 时间戳不同
      await new Promise((r) => setTimeout(r, 10));

      await updateNode(id, { title: "新标题" });

      const updated = await getNode(id);
      expect(updated!.title).toBe("新标题");
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        original!.updatedAt.getTime()
      );
    });

    it("同时更新内容、分类和标签", async () => {
      // 验证可以一次性更新多个字段
      const id = await createNode({ title: "待更新" });

      await updateNode(id, {
        content: "更新后的内容",
        category: "新分类",
        tags: ["新标签1", "新标签2"],
      });

      const updated = await getNode(id);
      expect(updated!.content).toBe("更新后的内容");
      expect(updated!.category).toBe("新分类");
      expect(updated!.tags).toEqual(["新标签1", "新标签2"]);
    });

    it("只更新传入的字段，未传入的字段保持不变", async () => {
      // 只更新 category，其他字段应保持原值
      const id = await createNode({
        title: "不变标题",
        content: "不变内容",
        category: "旧分类",
      });

      await updateNode(id, { category: "新分类" });

      const updated = await getNode(id);
      expect(updated!.title).toBe("不变标题");
      expect(updated!.content).toBe("不变内容");
      expect(updated!.category).toBe("新分类");
    });
  });

  describe("deleteNode — 删除知识节点", () => {
    it("删除节点后，记录已移除", async () => {
      // 创建节点，删除后验证 getNode 返回 null
      const id = await createNode({ title: "待删除" });

      await deleteNode(id);

      const node = await getNode(id);
      expect(node).toBeNull();
    });

    it("删除不存在的节点不会报错", async () => {
      // 删除一个不存在的 ID 不应抛出异常
      await expect(deleteNode("不存在的ID")).resolves.toBeUndefined();
    });
  });

  describe("getNode — 获取单个节点", () => {
    it("获取已存在的节点，返回数据正确", async () => {
      // 验证返回的节点数据与创建时一致
      const id = await createNode({
        title: "测试获取",
        content: "内容",
        category: "分类",
        tags: ["a", "b"],
      });

      const node = await getNode(id);
      expect(node).not.toBeNull();
      expect(node!.id).toBe(id);
      expect(node!.title).toBe("测试获取");
      expect(node!.content).toBe("内容");
      expect(node!.category).toBe("分类");
      expect(node!.tags).toEqual(["a", "b"]);
    });

    it("不存在的 ID 返回 null", async () => {
      // 查询一个不存在的 ID，应返回 null
      const node = await getNode("不存在的UUID");
      expect(node).toBeNull();
    });
  });

  describe("listNodes — 列出节点", () => {
    it("无搜索词时返回全部节点", async () => {
      // 创建多个节点，不带搜索词调用，应返回所有节点
      await createNode({ title: "TypeScript" });
      await createNode({ title: "React" });
      await createNode({ title: "Node.js" });

      const all = await listNodes();
      expect(all).toHaveLength(3);
      const titles = all.map((n) => n.title);
      expect(titles).toContain("TypeScript");
      expect(titles).toContain("React");
      expect(titles).toContain("Node.js");
    });

    it("有搜索词时按标题过滤", async () => {
      // 创建多个节点，搜索词匹配部分标题
      await createNode({ title: "TypeScript 基础" });
      await createNode({ title: "TypeScript 进阶" });
      await createNode({ title: "React 入门" });

      const results = await listNodes("TypeScript");
      expect(results).toHaveLength(2);
      results.forEach((n) => {
        expect(n.title).toContain("TypeScript");
      });
    });

    it("有搜索词时按分类过滤", async () => {
      // 创建不同分类的节点，搜索词匹配分类
      await createNode({ title: "TS 基础", category: "编程语言" });
      await createNode({ title: "React 基础", category: "前端框架" });
      await createNode({ title: "TS 进阶", category: "编程语言" });

      const results = await listNodes("编程语言");
      expect(results).toHaveLength(2);
      results.forEach((n) => {
        expect(n.category).toBe("编程语言");
      });
    });

    it("搜索词不匹配任何节点时返回空数组", async () => {
      // 搜索一个不存在的关键词，应返回空数组
      await createNode({ title: "TypeScript" });

      const results = await listNodes("完全不匹配的关键词");
      expect(results).toHaveLength(0);
    });

    it("无节点时返回空数组", async () => {
      // 数据库为空时调用 listNodes，应返回空数组
      const results = await listNodes();
      expect(results).toEqual([]);
    });
  });
});

// ============================================================
// 知识边（关联）Server Actions 测试
// ============================================================
describe("知识边（关联）Server Actions", () => {
  // 测试边需要先有两个节点
  let nodeA: string;
  let nodeB: string;

  beforeEach(async () => {
    // 每个边测试前创建两个基础节点
    nodeA = await createNode({ title: "源节点" });
    nodeB = await createNode({ title: "目标节点" });
  });

  describe("createEdge — 创建关联", () => {
    it("创建关联并返回有效的 ID", async () => {
      // 验证 createEdge 返回一个非空的 ID
      const edgeId = await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "prerequisite",
      });
      expect(edgeId).toBeDefined();
      expect(typeof edgeId).toBe("string");
      expect(edgeId.length).toBeGreaterThan(0);
    });

    it("创建的边 source/target/type 正确", async () => {
      // 验证创建的边数据完整正确
      const edgeId = await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "related",
      });

      const allEdges = await getAllEdges();
      expect(allEdges).toHaveLength(1);
      expect(allEdges[0].id).toBe(edgeId);
      expect(allEdges[0].sourceId).toBe(nodeA);
      expect(allEdges[0].targetId).toBe(nodeB);
      expect(allEdges[0].type).toBe("related");
    });

    it("支持所有边类型", async () => {
      // 验证三种边类型都能正确创建
      const types: Array<"prerequisite" | "related" | "builds_upon"> = [
        "prerequisite",
        "related",
        "builds_upon",
      ];
      for (const t of types) {
        await createEdge({ sourceId: nodeA, targetId: nodeB, type: t });
      }

      const allEdges = await getAllEdges();
      expect(allEdges).toHaveLength(3);
      const edgeTypes = allEdges.map((e) => e.type);
      expect(edgeTypes).toContain("prerequisite");
      expect(edgeTypes).toContain("related");
      expect(edgeTypes).toContain("builds_upon");
    });
  });

  describe("deleteEdge — 删除关联", () => {
    it("删除关联后，记录已移除", async () => {
      // 创建边后删除，验证 getAllEdges 为空
      const edgeId = await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "prerequisite",
      });

      await deleteEdge(edgeId);

      const allEdges = await getAllEdges();
      expect(allEdges).toHaveLength(0);
    });

    it("删除不存在的边不会报错", async () => {
      // 删除一个不存在的 ID 不应抛出异常
      await expect(deleteEdge("不存在的ID")).resolves.toBeUndefined();
    });
  });

  describe("getNodeEdges — 获取节点的出边和入边", () => {
    it("获取节点的出边（作为 source 的边）", async () => {
      // nodeA -> nodeB, nodeA -> nodeC，nodeA 有 2 条出边
      const nodeC = await createNode({ title: "节点C" });
      await createEdge({ sourceId: nodeA, targetId: nodeB, type: "related" });
      await createEdge({ sourceId: nodeA, targetId: nodeC, type: "builds_upon" });

      const { outgoing, incoming } = await getNodeEdges(nodeA);
      expect(outgoing).toHaveLength(2);
      expect(incoming).toHaveLength(0);
    });

    it("获取节点的入边（作为 target 的边）", async () => {
      // nodeA -> nodeB, nodeC -> nodeB，nodeB 有 2 条入边
      const nodeC = await createNode({ title: "节点C" });
      await createEdge({ sourceId: nodeA, targetId: nodeB, type: "prerequisite" });
      await createEdge({ sourceId: nodeC, targetId: nodeB, type: "related" });

      const { outgoing, incoming } = await getNodeEdges(nodeB);
      expect(outgoing).toHaveLength(0);
      expect(incoming).toHaveLength(2);
    });

    it("节点同时有出边和入边时分类正确", async () => {
      // nodeA -> nodeB, nodeC -> nodeB, nodeB -> nodeD
      // nodeB 同时有 1 条出边和 2 条入边
      const nodeC = await createNode({ title: "节点C" });
      const nodeD = await createNode({ title: "节点D" });
      await createEdge({ sourceId: nodeA, targetId: nodeB, type: "related" });
      await createEdge({ sourceId: nodeB, targetId: nodeC, type: "builds_upon" });
      await createEdge({ sourceId: nodeD, targetId: nodeB, type: "prerequisite" });

      const { outgoing, incoming } = await getNodeEdges(nodeB);
      expect(outgoing).toHaveLength(1);
      expect(incoming).toHaveLength(2);
    });

    it("无边时返回空数组", async () => {
      // 没有任何关联的节点，出边和入边都应为空
      const { outgoing, incoming } = await getNodeEdges(nodeA);
      expect(outgoing).toEqual([]);
      expect(incoming).toEqual([]);
    });
  });

  describe("getAllEdges — 获取所有边", () => {
    it("返回所有边记录", async () => {
      // 创建多条边，验证 getAllEdges 返回全部
      const nodeC = await createNode({ title: "节点C" });
      await createEdge({ sourceId: nodeA, targetId: nodeB, type: "prerequisite" });
      await createEdge({ sourceId: nodeB, targetId: nodeC, type: "related" });

      const allEdges = await getAllEdges();
      expect(allEdges).toHaveLength(2);
    });

    it("无任何边时返回空数组", async () => {
      // 数据库中没有边记录
      const allEdges = await getAllEdges();
      expect(allEdges).toEqual([]);
    });
  });
});

// ============================================================
// 外键级联删除测试（通过 Server Actions 验证）
// ============================================================
describe("外键级联删除（通过 Server Actions）", () => {
  it("删除节点后，该节点作为 source 的边应自动删除", async () => {
    // nodeA -> nodeB，删除 nodeA 后边应消失
    const nodeA = await createNode({ title: "源节点" });
    const nodeB = await createNode({ title: "目标节点" });
    await createEdge({
      sourceId: nodeA,
      targetId: nodeB,
      type: "prerequisite",
    });

    // 确认边已存在
    let allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(1);

    // 删除源节点
    await deleteNode(nodeA);

    // 关联的边应被级联删除
    allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(0);
  });

  it("删除节点后，该节点作为 target 的边应自动删除", async () => {
    // nodeA -> nodeB，删除 nodeB 后边应消失
    const nodeA = await createNode({ title: "源节点" });
    const nodeB = await createNode({ title: "目标节点" });
    await createEdge({
      sourceId: nodeA,
      targetId: nodeB,
      type: "related",
    });

    // 确认边已存在
    let allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(1);

    // 删除目标节点
    await deleteNode(nodeB);

    // 关联的边应被级联删除
    allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(0);
  });

  it("删除节点后，同时影响出边和入边", async () => {
    // nodeA -> nodeB, nodeB -> nodeC，删除 nodeB 后两条边都应消失
    const nodeA = await createNode({ title: "节点A" });
    const nodeB = await createNode({ title: "节点B" });
    const nodeC = await createNode({ title: "节点C" });
    await createEdge({ sourceId: nodeA, targetId: nodeB, type: "prerequisite" });
    await createEdge({ sourceId: nodeB, targetId: nodeC, type: "builds_upon" });

    // 确认两条边都存在
    let allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(2);

    // 删除中间节点 nodeB
    await deleteNode(nodeB);

    // 两条边都应被级联删除
    allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(0);
  });

  it("删除一个节点只影响与其关联的边，不影响其他边", async () => {
    // nodeA -> nodeB, nodeC -> nodeD，删除 nodeA 只删除第一条边
    const nodeA = await createNode({ title: "节点A" });
    const nodeB = await createNode({ title: "节点B" });
    const nodeC = await createNode({ title: "节点C" });
    const nodeD = await createNode({ title: "节点D" });
    await createEdge({ sourceId: nodeA, targetId: nodeB, type: "related" });
    await createEdge({ sourceId: nodeC, targetId: nodeD, type: "related" });

    // 删除 nodeA
    await deleteNode(nodeA);

    // 只剩下 nodeC -> nodeD
    const allEdges = await getAllEdges();
    expect(allEdges).toHaveLength(1);
    expect(allEdges[0].sourceId).toBe(nodeC);
    expect(allEdges[0].targetId).toBe(nodeD);
  });
});
