import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";

// ============================================================
// 测试 getMcpStats 统计功能
// ============================================================

// --- Mock 测试数据库 ---
const { testDb, testClient, TEST_DB_PATH } = vi.hoisted(() => {
  const { resolve } = require("path");
  const { existsSync, mkdirSync, unlinkSync } = require("fs");
  const { dirname } = require("path");
  const { drizzle } = require("drizzle-orm/libsql");
  const { createClient } = require("@libsql/client");

  const dbPath = resolve(process.cwd(), "data", "test_mcp_manage.db");

  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch {
      /* 文件可能被锁定，忽略 */
    }
  }

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client);
  return { testDb: db, testClient: client, TEST_DB_PATH: dbPath };
});

vi.mock("@/lib/db", () => ({
  db: testDb,
}));

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

import { getMcpStats } from "@/server/mcp-manage";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";

describe("getMcpStats — 获取统计数据", () => {
  beforeAll(async () => {
    for (const stmt of CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await testClient.execute(stmt);
    }
  });

  beforeEach(async () => {
    await testDb.delete(knowledgeEdges);
    await testDb.delete(knowledgeNodes);
  });

  afterAll(async () => {
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

  it("空数据库返回 nodeCount:0, edgeCount:0", async () => {
    const stats = await getMcpStats();
    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
  });

  it("有数据时返回正确的节点和边计数", async () => {
    const now = new Date();
    const nodeIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of nodeIds) {
      await testDb.insert(knowledgeNodes).values({
        id,
        title: `节点-${id}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    await testDb.insert(knowledgeEdges).values([
      {
        id: randomUUID(),
        sourceId: nodeIds[0],
        targetId: nodeIds[1],
        type: "prerequisite",
      },
      {
        id: randomUUID(),
        sourceId: nodeIds[1],
        targetId: nodeIds[2],
        type: "related",
      },
    ]);

    const stats = await getMcpStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);
  });

  it("只插入节点不插入边时 edgeCount 为 0", async () => {
    const now = new Date();
    await testDb.insert(knowledgeNodes).values({
      id: randomUUID(),
      title: "孤立节点",
      createdAt: now,
      updatedAt: now,
    });

    const stats = await getMcpStats();
    expect(stats.nodeCount).toBe(1);
    expect(stats.edgeCount).toBe(0);
  });
});
