import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";

// ============================================================
// 测试 MCP 管理功能（启动/停止/状态/统计）
// ============================================================

// --- Mock child_process.spawn ---
// 记录 spawn 的调用参数和返回的伪进程对象
const spawnCalls: Array<{
  command: string;
  args: string[];
}> = [];
let mockPid = 12345; // 模拟进程 PID

vi.mock("child_process", () => {
  return {
    spawn: (command: string, args: string[], _options: unknown) => {
      spawnCalls.push({ command, args });

      // 创建模拟的子进程对象
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

      const mockProc = {
        pid: mockPid++,
        stdout: {
          on: (event: string, cb: (...args: unknown[]) => void) => {
            if (!listeners[`stdout_${event}`]) listeners[`stdout_${event}`] = [];
            listeners[`stdout_${event}`].push(cb);
          },
        },
        stderr: {
          on: (event: string, cb: (...args: unknown[]) => void) => {
            if (!listeners[`stderr_${event}`]) listeners[`stderr_${event}`] = [];
            listeners[`stderr_${event}`].push(cb);
          },
        },
        on: (event: string, cb: (...args: unknown[]) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        },
        kill: () => {
          // 模拟进程被杀死后触发 close 事件
          const closeListeners = listeners["close"] || [];
          closeListeners.forEach((cb) => cb(0));
        },
        // 辅助方法：模拟触发事件（用于测试）
        _emit: (target: string, event: string, data: unknown) => {
          const key = `${target}_${event}`;
          const cbs = listeners[key] || [];
          cbs.forEach((cb) => cb(data));
        },
      };

      return mockProc;
    },
  };
});

// --- Mock 测试数据库 ---
// 使用独立的测试数据库，避免影响生产数据
const { testDb, testClient, TEST_DB_PATH } = vi.hoisted(() => {
  const { resolve } = require("path");
  const { existsSync, mkdirSync, unlinkSync } = require("fs");
  const { dirname } = require("path");
  const { drizzle } = require("drizzle-orm/libsql");
  const { createClient } = require("@libsql/client");

  const dbPath = resolve(process.cwd(), "data", "test_mcp_manage.db");

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

// 模拟 @/lib/db 模块，让 mcp-manage.ts 使用测试数据库
vi.mock("@/lib/db", () => ({
  db: testDb,
}));

// 建表 SQL（只需要 mcp-manage 用到的两张表）
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

// 在 mock 生效后导入被测模块
import {
  getMcpStatus,
  startMcp,
  stopMcp,
  getMcpStats,
} from "@/server/mcp-manage";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";

// ============================================================
// 测试：MCP 状态管理
// ============================================================
describe("MCP 状态管理", () => {
  beforeEach(async () => {
    // 每个测试前确保 MCP 进程处于停止状态
    try {
      await stopMcp();
    } catch {
      // 如果未运行，stopMcp 会返回 false，不影响测试
    }
    // 清空 spawn 调用记录
    spawnCalls.length = 0;
  });

  describe("getMcpStatus — 获取 MCP 状态", () => {
    it("初始状态应为 stopped", async () => {
      // 初始状态（或 stopMcp 之后）应该返回 stopped
      const status = await getMcpStatus();
      expect(status.status).toBe("stopped");
    });

    it("启动后状态变为 running", async () => {
      // startMcp 后状态应变为 running
      await startMcp();
      const status = await getMcpStatus();
      expect(status.status).toBe("running");
    });

    it("停止后状态变为 stopped", async () => {
      // 启动后再停止，状态应回到 stopped
      await startMcp();
      await stopMcp();
      const status = await getMcpStatus();
      expect(status.status).toBe("stopped");
    });

    it("output 字段为数组", async () => {
      // output 应该始终是字符串数组
      const status = await getMcpStatus();
      expect(Array.isArray(status.output)).toBe(true);
    });

    it("未运行时 pid 应为 null", async () => {
      // 进程未启动时 pid 为 null
      const status = await getMcpStatus();
      expect(status.pid).toBeNull();
    });

    it("运行时 pid 不为 null", async () => {
      // 进程运行时 pid 应有值
      await startMcp();
      const status = await getMcpStatus();
      expect(status.pid).not.toBeNull();
      expect(typeof status.pid).toBe("number");
    });
  });

  describe("startMcp — 启动 MCP 服务", () => {
    it("首次启动应返回 success:true", async () => {
      // 正常启动应返回成功
      const result = await startMcp();
      expect(result.success).toBe(true);
      expect(result.message).toContain("已启动");
    });

    it("重复启动应返回 success:false", async () => {
      // 已经在运行时再次调用 startMcp 应返回失败
      await startMcp();
      const result = await startMcp();
      expect(result.success).toBe(false);
      expect(result.message).toContain("已在运行");
    });

    it("应使用 npx tsx 启动 server.ts", async () => {
      // 验证 spawn 调用参数正确
      await startMcp();
      expect(spawnCalls.length).toBeGreaterThan(0);

      const lastCall = spawnCalls[spawnCalls.length - 1];
      expect(lastCall.command).toBe("npx");
      expect(lastCall.args[0]).toBe("tsx");
      expect(lastCall.args[1]).toContain("server.ts");
    });
  });

  describe("stopMcp — 停止 MCP 服务", () => {
    it("运行中停止应返回 success:true", async () => {
      // 先启动，再停止，应返回成功
      await startMcp();
      const result = await stopMcp();
      expect(result.success).toBe(true);
      expect(result.message).toContain("已停止");
    });

    it("未运行时停止应返回 success:false", async () => {
      // 未启动时调用 stopMcp 应返回失败
      const result = await stopMcp();
      expect(result.success).toBe(false);
      expect(result.message).toContain("未在运行");
    });

    it("停止后再次启动应成功", async () => {
      // 验证可以反复启动-停止
      await startMcp();
      await stopMcp();
      const result = await startMcp();
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================
// 测试：MCP 统计功能
// ============================================================
describe("getMcpStats — 获取统计数据", () => {
  beforeAll(async () => {
    // 创建表结构
    for (const stmt of CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await testClient.execute(stmt);
    }
  });

  beforeEach(async () => {
    // 每个测试前清空表
    await testDb.delete(knowledgeEdges);
    await testDb.delete(knowledgeNodes);
  });

  afterAll(async () => {
    // 清理测试数据库
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
    // 无数据时计数应为 0
    const stats = await getMcpStats();
    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
  });

  it("有数据时返回正确的节点和边计数", async () => {
    // 插入 3 个节点
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

    // 插入 2 条边
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

    // 验证统计正确
    const stats = await getMcpStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);
  });

  it("只插入节点不插入边时 edgeCount 为 0", async () => {
    // 只插入节点，边计数应为 0
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
