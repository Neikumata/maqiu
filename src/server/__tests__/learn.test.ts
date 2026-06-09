import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";

// 测试数据库文件路径（独立文件，避免与其他测试套件冲突）
// 注意：不能在模块顶层用 const 定义，因为 vi.hoisted 回调会在 const 初始化前执行（TDZ）
// 所以把路径定义放到 vi.hoisted 内部，或者用 var/函数来延迟求值

// 清理残留的测试数据库（使用 var 避免 TDZ）
var TEST_DB_PATH = resolve(process.cwd(), "data", "test_learn.db");

if (existsSync(TEST_DB_PATH)) {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    /* 文件可能被锁定，忽略 */
  }
}

// 确保目录存在
const dir = dirname(resolve(process.cwd(), "data", "test_learn.db"));
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// 使用 vi.hoisted 在 mock 提升之前创建测试数据库连接
// 这样 vi.mock 的工厂函数就能安全引用 testDb
const { testDb, client } = vi.hoisted(() => {
  const { drizzle } = require("drizzle-orm/libsql");
  const { createClient } = require("@libsql/client");
  const { resolve } = require("path");
  const dbPath = resolve(process.cwd(), "data", "test_learn.db");
  const cl = createClient({ url: `file:${dbPath}` });
  return { testDb: drizzle(cl), client: cl };
});

// 模拟 @/lib/db 模块，让 Server Actions 使用测试数据库
vi.mock("@/lib/db", () => ({
  db: testDb,
}));

// 在 mock 生效后再导入 Server Actions
import {
  initProgress,
  getProgress,
  updateProgress,
  getRecommendedNext,
  getDueReviews,
} from "@/server/learn";

// 同时导入知识库 Server Actions，用于创建测试所需的知识节点
import { createNode, deleteNode, createEdge } from "@/server/knowledge";

import * as schema from "@/lib/db/schema";

const { knowledgeNodes, knowledgeEdges, learningProgress } = schema;

// 建表 SQL（与 drizzle 迁移文件一致，包含学习进度相关表）
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
`;

// 辅助函数：生成唯一 ID
function uid(): string {
  return randomUUID();
}

beforeAll(async () => {
  // 在所有测试开始前创建表结构
  for (const stmt of CREATE_TABLES_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await client.execute(stmt);
  }
});

beforeEach(async () => {
  // 每个测试前清空所有表（按外键依赖顺序删除）
  await testDb.delete(learningProgress);
  await testDb.delete(knowledgeEdges);
  await testDb.delete(knowledgeNodes);
});

afterAll(async () => {
  // 测试结束后关闭连接并清理测试数据库文件
  client.close();
  await new Promise((r) => setTimeout(r, 200));
  const dbPath = resolve(process.cwd(), "data", "test_learn.db");
  if (existsSync(dbPath)) {
    for (let i = 0; i < 5; i++) {
      try {
        unlinkSync(dbPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
});

// ============================================================
// 学习进度 Server Actions 测试
// ============================================================
describe("学习进度 Server Actions", () => {
  describe("initProgress — 初始化学习进度", () => {
    it("为一个知识点初始化进度，默认状态为 not_started", async () => {
      // 创建知识节点后初始化进度，验证默认值
      const nodeId = await createNode({ title: "TypeScript 基础" });
      const progress = await initProgress(nodeId);

      expect(progress).not.toBeNull();
      expect(progress!.nodeId).toBe(nodeId);
      expect(progress!.status).toBe("not_started");
      expect(progress!.reviewCount).toBe(0);
      expect(progress!.score).toBe(0);
    });

    it("再次调用 initProgress 不重复创建记录", async () => {
      // 同一个节点重复初始化，应返回已有记录而不是创建新的
      const nodeId = await createNode({ title: "React 入门" });
      const first = await initProgress(nodeId);
      const second = await initProgress(nodeId);

      expect(second!.id).toBe(first!.id);
      // 数据库中应只有一条进度记录
      const allProgress = await testDb.select().from(learningProgress);
      expect(allProgress).toHaveLength(1);
    });

    it("为不同节点初始化进度，各自独立", async () => {
      // 两个不同节点的进度互不影响
      const nodeA = await createNode({ title: "节点A" });
      const nodeB = await createNode({ title: "节点B" });

      const progressA = await initProgress(nodeA);
      const progressB = await initProgress(nodeB);

      expect(progressA!.id).not.toBe(progressB!.id);
      expect(progressA!.nodeId).toBe(nodeA);
      expect(progressB!.nodeId).toBe(nodeB);

      const allProgress = await testDb.select().from(learningProgress);
      expect(allProgress).toHaveLength(2);
    });
  });

  describe("getProgress — 获取学习进度", () => {
    it("获取已有进度，返回正确数据", async () => {
      // 先初始化进度，再获取，验证数据一致
      const nodeId = await createNode({ title: "获取进度测试" });
      await initProgress(nodeId);

      const progress = await getProgress(nodeId);
      expect(progress).not.toBeNull();
      expect(progress!.nodeId).toBe(nodeId);
      expect(progress!.status).toBe("not_started");
    });

    it("不存在的 nodeId 返回 null", async () => {
      // 查询一个不存在的节点 ID，应返回 null
      const progress = await getProgress(uid());
      expect(progress).toBeNull();
    });

    it("节点存在但未初始化进度时返回 null", async () => {
      // 节点已创建但没有初始化学习进度，应返回 null
      const nodeId = await createNode({ title: "未初始化进度" });
      const progress = await getProgress(nodeId);
      expect(progress).toBeNull();
    });
  });

  describe("updateProgress — 更新学习进度", () => {
    it("将状态更新为 learning", async () => {
      // 从 not_started 更新为 learning
      const nodeId = await createNode({ title: "学习中" });
      await initProgress(nodeId);

      const updated = await updateProgress(nodeId, { status: "learning" });
      expect(updated!.status).toBe("learning");
    });

    it("将状态更新为 mastered，reviewCount 应递增", async () => {
      // 更新为 mastered 时，reviewCount 应从 0 变为 1
      const nodeId = await createNode({ title: "已掌握" });
      await initProgress(nodeId);

      const updated = await updateProgress(nodeId, { status: "mastered" });
      expect(updated!.status).toBe("mastered");
      expect(updated!.reviewCount).toBe(1);
    });

    it("将状态更新为 needs_review", async () => {
      // 更新为需要复习状态
      const nodeId = await createNode({ title: "需复习" });
      await initProgress(nodeId);

      const updated = await updateProgress(nodeId, { status: "needs_review" });
      expect(updated!.status).toBe("needs_review");
    });

    it("mastered 时应设置下次复习时间", async () => {
      // mastered 状态下 nextReviewAt 应该在未来
      const nodeId = await createNode({ title: "复习时间" });
      await initProgress(nodeId);

      const now = new Date();
      const updated = await updateProgress(nodeId, { status: "mastered" });
      expect(updated!.nextReviewAt).not.toBeNull();
      expect(updated!.nextReviewAt!.getTime()).toBeGreaterThan(now.getTime());
    });

    it("needs_review 时应设置下次复习时间为明天", async () => {
      // needs_review 状态下 nextReviewAt 应大约在 1 天后
      const nodeId = await createNode({ title: "需复习时间" });
      await initProgress(nodeId);

      const now = new Date();
      const updated = await updateProgress(nodeId, { status: "needs_review" });
      expect(updated!.nextReviewAt).not.toBeNull();

      // 1 天后（允许 2 秒误差）
      const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const diff = Math.abs(
        updated!.nextReviewAt!.getTime() - oneDayLater.getTime()
      );
      expect(diff).toBeLessThan(2000);
    });

    it("learning 状态下 nextReviewAt 应为 null", async () => {
      // learning 状态不需要复习，nextReviewAt 应为 null
      const nodeId = await createNode({ title: "学习中无复习" });
      await initProgress(nodeId);

      const updated = await updateProgress(nodeId, { status: "learning" });
      expect(updated!.nextReviewAt).toBeNull();
    });

    it("更新 score 分数", async () => {
      // 验证分数更新正确
      const nodeId = await createNode({ title: "分数测试" });
      await initProgress(nodeId);

      const updated = await updateProgress(nodeId, {
        status: "learning",
        score: 85,
      });
      expect(updated!.score).toBe(85);
    });

    it("不传 score 时保持原有分数", async () => {
      // 先设置分数，再更新状态不传分数，分数应保持不变
      const nodeId = await createNode({ title: "保持分数" });
      await initProgress(nodeId);
      await updateProgress(nodeId, { status: "learning", score: 90 });

      const updated = await updateProgress(nodeId, { status: "mastered" });
      expect(updated!.score).toBe(90);
    });

    it("多次 mastered 后 reviewCount 持续递增", async () => {
      // 每次 mastered 都应让 reviewCount +1
      const nodeId = await createNode({ title: "多次复习" });
      await initProgress(nodeId);

      // 第一次 mastered
      await updateProgress(nodeId, { status: "mastered" });
      let progress = await getProgress(nodeId);
      expect(progress!.reviewCount).toBe(1);

      // 切到 needs_review，再 mastered
      await updateProgress(nodeId, { status: "needs_review" });
      await updateProgress(nodeId, { status: "mastered" });
      progress = await getProgress(nodeId);
      expect(progress!.reviewCount).toBe(2);

      // 再次 mastered
      await updateProgress(nodeId, { status: "mastered" });
      progress = await getProgress(nodeId);
      expect(progress!.reviewCount).toBe(3);
    });
  });

  describe("间隔复习逻辑", () => {
    it("首次 mastered 后 nextReviewAt 约 1 天后", async () => {
      // reviewCount=0 时间隔为 1 天（第一次 mastered）
      const nodeId = await createNode({ title: "间隔1天" });
      await initProgress(nodeId);

      const now = new Date();
      const updated = await updateProgress(nodeId, { status: "mastered" });

      // 验证 reviewCount（从 not_started -> mastered，reviewCount 应该从 0 变成 1）
      expect(updated!.reviewCount).toBe(1);

      // nextReviewAt 应该是 now + 1 天
      const expectedTime = now.getTime() + 1 * 24 * 60 * 60 * 1000;
      const actualTime = updated!.nextReviewAt!.getTime();
      const diff = Math.abs(actualTime - expectedTime);

      // 允许 5000 毫秒误差（数据库操作和异步延迟）
      expect(diff).toBeLessThan(5000);
    });

    it("第二次 mastered 后间隔为 3 天", async () => {
      // reviewCount=2 时间隔为 3 天
      const nodeId = await createNode({ title: "间隔3天" });
      await initProgress(nodeId);

      // 第一次 mastered（reviewCount=1）
      await updateProgress(nodeId, { status: "mastered" });

      // 第二次 mastered（reviewCount=2）
      const now = new Date();
      const updated = await updateProgress(nodeId, { status: "mastered" });
      expect(updated!.reviewCount).toBe(2);

      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(
        updated!.nextReviewAt!.getTime() - threeDaysLater.getTime()
      );
      expect(diff).toBeLessThan(5000);
    });

    it("第三次 mastered 后间隔为 7 天", async () => {
      // reviewCount=3 时间隔为 7 天
      const nodeId = await createNode({ title: "间隔7天" });
      await initProgress(nodeId);

      await updateProgress(nodeId, { status: "mastered" });
      await updateProgress(nodeId, { status: "mastered" });

      const now = new Date();
      const updated = await updateProgress(nodeId, { status: "mastered" });
      expect(updated!.reviewCount).toBe(3);

      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(
        updated!.nextReviewAt!.getTime() - sevenDaysLater.getTime()
      );
      expect(diff).toBeLessThan(5000);
    });

    it("随着 reviewCount 增加间隔变长", async () => {
      // 验证每次复习后 nextReviewAt 越来越远
      const nodeId = await createNode({ title: "递增间隔" });
      await initProgress(nodeId);

      const intervals: number[] = [];

      for (let i = 0; i < 4; i++) {
        const before = new Date();
        const updated = await updateProgress(nodeId, { status: "mastered" });
        const daysUntilReview =
          (updated!.nextReviewAt!.getTime() - before.getTime()) /
          (24 * 60 * 60 * 1000);
        intervals.push(daysUntilReview);
      }

      // 间隔应单调递增（1天、3天、7天、14天）
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
      }
    });
  });
});

// ============================================================
// 学习路径推荐测试
// ============================================================
describe("学习路径推荐", () => {
  describe("getRecommendedNext — 推荐下一个学习节点", () => {
    it("没有任何学习记录时，所有节点都应被推荐", async () => {
      // 没有进度记录的节点（无前置知识），应全部被推荐
      const nodeA = await createNode({ title: "节点A" });
      const nodeB = await createNode({ title: "节点B" });
      const nodeC = await createNode({ title: "节点C" });

      const recommended = await getRecommendedNext();
      expect(recommended).toHaveLength(3);
      expect(recommended).toContain(nodeA);
      expect(recommended).toContain(nodeB);
      expect(recommended).toContain(nodeC);
    });

    it("已有前置知识且未 mastered 的节点不应被推荐", async () => {
      // A -> B（A 是 B 的前置知识），A 未 mastered，B 不应被推荐
      const nodeA = await createNode({ title: "前置知识A" });
      const nodeB = await createNode({ title: "后续知识B" });

      await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "prerequisite",
      });

      // A 不初始化进度（相当于未开始，也不算 mastered）
      // B 有前置知识 A 且 A 未 mastered，B 不应被推荐
      const recommended = await getRecommendedNext();
      expect(recommended).toContain(nodeA);  // A 无前置知识，应被推荐
      expect(recommended).not.toContain(nodeB);  // B 的前置知识 A 未 mastered，不应被推荐
    });

    it("前置知识已 mastered 的节点应被推荐", async () => {
      // A -> B（A 是 B 的前置知识），A 已 mastered，B 应被推荐
      const nodeA = await createNode({ title: "已掌握前置" });
      const nodeB = await createNode({ title: "可学习后续" });

      await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "prerequisite",
      });

      // A mastered
      await initProgress(nodeA);
      await updateProgress(nodeA, { status: "mastered" });

      const recommended = await getRecommendedNext();
      expect(recommended).toContain(nodeB);
    });

    it("已经 mastered 的节点不应再被推荐", async () => {
      // 节点已 mastered，不应出现在推荐列表中
      const nodeA = await createNode({ title: "已掌握" });

      await initProgress(nodeA);
      await updateProgress(nodeA, { status: "mastered" });

      const recommended = await getRecommendedNext();
      expect(recommended).not.toContain(nodeA);
    });

    it("已经 learning 的节点不应再被推荐", async () => {
      // 节点正在学习，不应出现在推荐列表中
      const nodeA = await createNode({ title: "学习中" });

      await initProgress(nodeA);
      await updateProgress(nodeA, { status: "learning" });

      const recommended = await getRecommendedNext();
      expect(recommended).not.toContain(nodeA);
    });

    it("没有前置知识的节点无论有没有进度记录都应被推荐", async () => {
      // 没有前置知识的节点，即使有 not_started 进度，也应被推荐
      const nodeA = await createNode({ title: "无前置" });

      // 初始化进度（not_started 状态）
      await initProgress(nodeA);

      const recommended = await getRecommendedNext();
      expect(recommended).toContain(nodeA);
    });

    it("多个前置知识需全部 mastered 才能推荐", async () => {
      // A -> C, B -> C，C 需要同时掌握 A 和 B
      const nodeA = await createNode({ title: "前置A" });
      const nodeB = await createNode({ title: "前置B" });
      const nodeC = await createNode({ title: "综合C" });

      await createEdge({
        sourceId: nodeA,
        targetId: nodeC,
        type: "prerequisite",
      });
      await createEdge({
        sourceId: nodeB,
        targetId: nodeC,
        type: "prerequisite",
      });

      // 只 mastered A，B 未掌握
      await initProgress(nodeA);
      await updateProgress(nodeA, { status: "mastered" });

      const recommended1 = await getRecommendedNext();
      expect(recommended1).not.toContain(nodeC);

      // mastered B 后，C 应被推荐
      await initProgress(nodeB);
      await updateProgress(nodeB, { status: "mastered" });

      const recommended2 = await getRecommendedNext();
      expect(recommended2).toContain(nodeC);
    });

    it("related 和 builds_upon 类型的边不影响推荐", async () => {
      // 只有 prerequisite 类型的边影响推荐逻辑
      const nodeA = await createNode({ title: "关联A" });
      const nodeB = await createNode({ title: "关联B" });

      // 创建 related 类型的边（不是 prerequisite）
      await createEdge({
        sourceId: nodeA,
        targetId: nodeB,
        type: "related",
      });

      // 即使 A 未 mastered，B 也应被推荐（因为 related 不算前置知识）
      const recommended = await getRecommendedNext();
      expect(recommended).toContain(nodeB);
    });
  });

  describe("getDueReviews — 获取到期复习", () => {
    it("nextReviewAt 已过期的记录应返回", async () => {
      // 手动插入一条 nextReviewAt 在过去的进度记录
      const nodeId = await createNode({ title: "到期复习" });
      const progressId = uid();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 昨天
      await testDb.insert(learningProgress).values({
        id: progressId,
        nodeId,
        status: "mastered",
        reviewCount: 1,
        nextReviewAt: pastDate,
        createdAt: new Date(),
      });

      const dueReviews = await getDueReviews();
      expect(dueReviews).toHaveLength(1);
      expect(dueReviews[0].progress.nodeId).toBe(nodeId);
      expect(dueReviews[0].node.id).toBe(nodeId);
      expect(dueReviews[0].node.title).toBe("到期复习");
    });

    it("nextReviewAt 未过期的记录不应返回", async () => {
      // 手动插入一条 nextReviewAt 在未来的进度记录
      const nodeId = await createNode({ title: "未到期" });
      const progressId = uid();
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 天后
      await testDb.insert(learningProgress).values({
        id: progressId,
        nodeId,
        status: "mastered",
        reviewCount: 1,
        nextReviewAt: futureDate,
        createdAt: new Date(),
      });

      const dueReviews = await getDueReviews();
      expect(dueReviews).toHaveLength(0);
    });

    it("not_started 状态的记录即使过期也不应返回", async () => {
      // not_started 状态不应出现在复习列表中
      const nodeId = await createNode({ title: "未开始" });
      const progressId = uid();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await testDb.insert(learningProgress).values({
        id: progressId,
        nodeId,
        status: "not_started",
        nextReviewAt: pastDate,
        createdAt: new Date(),
      });

      const dueReviews = await getDueReviews();
      expect(dueReviews).toHaveLength(0);
    });

    it("多条到期记录应全部返回", async () => {
      // 多个到期记录都应返回
      const nodeA = await createNode({ title: "到期A" });
      const nodeB = await createNode({ title: "到期B" });
      const pastDate = new Date(Date.now() - 1000);

      await testDb.insert(learningProgress).values([
        {
          id: uid(),
          nodeId: nodeA,
          status: "mastered",
          reviewCount: 1,
          nextReviewAt: pastDate,
          createdAt: new Date(),
        },
        {
          id: uid(),
          nodeId: nodeB,
          status: "needs_review",
          reviewCount: 2,
          nextReviewAt: pastDate,
          createdAt: new Date(),
        },
      ]);

      const dueReviews = await getDueReviews();
      expect(dueReviews).toHaveLength(2);
    });

    it("无到期记录时返回空数组", async () => {
      // 没有任何进度记录时返回空数组
      const dueReviews = await getDueReviews();
      expect(dueReviews).toEqual([]);
    });
  });
});

// ============================================================
// 与知识库的联动测试
// ============================================================
describe("与知识库的联动", () => {
  it("创建知识节点后才能初始化学习进度", async () => {
    // 正常流程：先创建节点，再初始化进度
    const nodeId = await createNode({ title: "联动测试" });
    const progress = await initProgress(nodeId);
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("not_started");
  });

  it("对不存在的节点初始化进度应报错（外键约束）", async () => {
    // 直接用不存在的 nodeId 调用 initProgress，外键约束应阻止插入
    const fakeNodeId = uid();
    await expect(initProgress(fakeNodeId)).rejects.toThrow();
  });

  it("删除知识节点后学习进度应级联删除", async () => {
    // 创建节点、初始化进度，删除节点后进度应消失
    const nodeId = await createNode({ title: "级联删除测试" });
    await initProgress(nodeId);

    // 确认进度存在
    let progress = await getProgress(nodeId);
    expect(progress).not.toBeNull();

    // 删除节点
    await deleteNode(nodeId);

    // 进度应被级联删除
    progress = await getProgress(nodeId);
    expect(progress).toBeNull();
  });

  it("删除一个节点不影响其他节点的进度", async () => {
    // 两个节点各有进度，删除一个不影响另一个
    const nodeA = await createNode({ title: "节点A" });
    const nodeB = await createNode({ title: "节点B" });

    await initProgress(nodeA);
    await initProgress(nodeB);

    await deleteNode(nodeA);

    // nodeA 的进度应消失
    const progressA = await getProgress(nodeA);
    expect(progressA).toBeNull();

    // nodeB 的进度应保留
    const progressB = await getProgress(nodeB);
    expect(progressB).not.toBeNull();
    expect(progressB!.nodeId).toBe(nodeB);
  });

  it("更新进度后删除节点，进度也应级联删除", async () => {
    // 更新进度到 mastered 后再删除节点
    const nodeId = await createNode({ title: "更新后删除" });
    await initProgress(nodeId);
    await updateProgress(nodeId, { status: "mastered", score: 100 });

    await deleteNode(nodeId);

    const progress = await getProgress(nodeId);
    expect(progress).toBeNull();
  });
});
