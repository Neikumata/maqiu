import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { eq, like, or, and, ne, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "./db";
import {
  knowledgeNodes,
  knowledgeEdges,
  learningProgress,
  questions,
  examResults,
  examAnswers,
} from "@/lib/db/schema";

const server = new McpServer({
  name: "maqiu",
  version: "0.0.1",
});

// ============ 知识库工具 ============

server.tool("search_knowledge", "搜索知识节点", { query: z.string().optional() }, async ({ query }) => {
  const nodes = query
    ? await db.select().from(knowledgeNodes).where(or(like(knowledgeNodes.title, `%${query}%`), like(knowledgeNodes.category, `%${query}%`)))
    : await db.select().from(knowledgeNodes);

  if (nodes.length === 0) {
    return { content: [{ type: "text" as const, text: "没有找到知识节点" }] };
  }

  const text = nodes.map((n) => `[${n.id}] ${n.title}${n.category ? ` (${n.category})` : ""}`).join("\n");
  return { content: [{ type: "text" as const, text: `找到 ${nodes.length} 个知识节点：\n${text}` }] };
});

server.tool("get_knowledge", "获取知识节点详情（含关联）", { id: z.string() }, async ({ id }) => {
  const nodes = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, id));
  const node = nodes[0];
  if (!node) return { content: [{ type: "text" as const, text: "未找到该知识节点" }] };

  const outgoing = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.sourceId, id));
  const incoming = await db.select().from(knowledgeEdges).where(eq(knowledgeEdges.targetId, id));

  let text = `# ${node.title}\n分类: ${node.category || "无"}\n标签: ${(node.tags as string[])?.join(", ") || "无"}\n更新: ${new Date(node.updatedAt).toLocaleDateString("zh-CN")}\n\n${(node.content as string) || "（无内容）"}`;

  if (incoming.length > 0) {
    text += `\n\n## 前置知识\n` + incoming.map((e) => `- [${e.sourceId}] (${e.type})`).join("\n");
  }
  if (outgoing.length > 0) {
    text += `\n\n## 后续知识\n` + outgoing.map((e) => `- [${e.targetId}] (${e.type})`).join("\n");
  }

  return { content: [{ type: "text" as const, text }] };
});

server.tool(
  "create_knowledge",
  "创建知识节点",
  {
    title: z.string(),
    content: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  async ({ title, content, category, tags }) => {
    // Check for existing node with same title
    const existing = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.title, title));
    if (existing.length > 0) {
      const node = existing[0];
      return { content: [{ type: "text" as const, text: `Knowledge node already exists: [${node.id}] ${node.title}` }] };
    }

    const id = randomUUID();
    const now = new Date();
    await db.insert(knowledgeNodes).values({
      id, title, content: content ?? "", category: category ?? "",
      tags: tags ?? [], createdAt: now, updatedAt: now,
    });
    return { content: [{ type: "text" as const, text: `已创建知识节点：[${id}] ${title}` }] };
  }
);

server.tool(
  "update_knowledge",
  "更新知识节点",
  {
    id: z.string(), title: z.string().optional(), content: z.string().optional(),
    category: z.string().optional(), tags: z.array(z.string()).optional(),
  },
  async ({ id, title, content, category, tags }) => {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = tags;
    await db.update(knowledgeNodes).set(data).where(eq(knowledgeNodes.id, id));
    return { content: [{ type: "text" as const, text: `已更新知识节点 ${id}` }] };
  }
);

server.tool("delete_knowledge", "删除知识节点（级联删除关联）", { id: z.string() }, async ({ id }) => {
  await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id));
  return { content: [{ type: "text" as const, text: `已删除知识节点 ${id} 及其关联` }] };
});

server.tool(
  "link_knowledge",
  "建立知识关联",
  {
    sourceId: z.string(), targetId: z.string(),
    type: z.enum(["prerequisite", "related", "builds_upon"]),
  },
  async ({ sourceId, targetId, type }) => {
    const id = randomUUID();
    await db.insert(knowledgeEdges).values({ id, sourceId, targetId, type });
    const labels: Record<string, string> = { prerequisite: "前置知识", related: "相关知识", builds_upon: "进阶知识" };
    return { content: [{ type: "text" as const, text: `已创建关联：${sourceId} → ${targetId}（${labels[type]}）` }] };
  }
);

server.tool("unlink_knowledge", "删除知识关联", { edgeId: z.string() }, async ({ edgeId }) => {
  await db.delete(knowledgeEdges).where(eq(knowledgeEdges.id, edgeId));
  return { content: [{ type: "text" as const, text: `已删除关联 ${edgeId}` }] };
});

// ============ 学习系统工具 ============

server.tool("get_learning_status", "获取学习进度（不传 nodeId 返回全部）", { nodeId: z.string().optional() }, async ({ nodeId }) => {
  if (nodeId) {
    const rows = await db.select().from(learningProgress).where(eq(learningProgress.nodeId, nodeId));
    if (rows.length === 0) return { content: [{ type: "text" as const, text: "该节点暂无学习记录" }] };
    const p = rows[0];
    return {
      content: [{
        type: "text" as const,
        text: `状态: ${p.status}\n分数: ${p.score}\n复习次数: ${p.reviewCount}\n上次复习: ${p.lastReviewedAt ? new Date(p.lastReviewedAt).toLocaleDateString("zh-CN") : "无"}\n下次复习: ${p.nextReviewAt ? new Date(p.nextReviewAt).toLocaleDateString("zh-CN") : "无"}`,
      }],
    };
  }

  const all = await db.select({
    progress: learningProgress,
    node: knowledgeNodes,
  }).from(learningProgress).innerJoin(knowledgeNodes, eq(learningProgress.nodeId, knowledgeNodes.id));

  if (all.length === 0) return { content: [{ type: "text" as const, text: "暂无学习记录" }] };

  const text = all.map(({ progress: p, node: n }) =>
    `- ${n.title}: ${p.status}${p.nextReviewAt ? ` (下次复习: ${new Date(p.nextReviewAt).toLocaleDateString("zh-CN")})` : ""}`
  ).join("\n");
  return { content: [{ type: "text" as const, text: `学习进度：\n${text}` }] };
});

server.tool(
  "update_learning_status",
  "更新学习状态",
  { nodeId: z.string(), status: z.enum(["not_started", "learning", "mastered", "needs_review"]), score: z.number().optional() },
  async ({ nodeId, status, score }) => {
    const existing = await db.select().from(learningProgress).where(eq(learningProgress.nodeId, nodeId));
    const now = new Date();

    if (existing.length === 0) {
      await db.insert(learningProgress).values({
        id: randomUUID(), nodeId, status, score: score ?? 0,
        reviewCount: 0, createdAt: now,
      });
    } else {
      const prev = existing[0];
      const newReviewCount = prev.reviewCount + (status === "mastered" ? 1 : 0);
      let nextReview: Date | null = null;
      if (status === "mastered") {
        const intervals = [1, 3, 7, 14, 30];
        const days = intervals[Math.min(newReviewCount, intervals.length - 1)];
        nextReview = new Date(now.getTime() + days * 86400000);
      } else if (status === "needs_review") {
        nextReview = new Date(now.getTime() + 86400000);
      }
      await db.update(learningProgress).set({
        status, score: score ?? prev.score, lastReviewedAt: now,
        reviewCount: newReviewCount, nextReviewAt: nextReview,
      }).where(eq(learningProgress.nodeId, nodeId));
    }

    const labels: Record<string, string> = { not_started: "未开始", learning: "学习中", mastered: "已掌握", needs_review: "需复习" };
    return { content: [{ type: "text" as const, text: `已更新学习状态：${labels[status]}` }] };
  }
);

server.tool("get_recommended", "获取推荐学习的知识节点（前置知识已掌握的）", {}, async () => {
  const allNodes = await db.select().from(knowledgeNodes);
  const allProgress = await db.select().from(learningProgress);
  const prereqEdges = (await db.select().from(knowledgeEdges)).filter((e) => e.type === "prerequisite");
  const progressMap = new Map(allProgress.map((p) => [p.nodeId, p.status]));

  const recommended = allNodes.filter((node) => {
    const status = progressMap.get(node.id);
    if (status && status !== "not_started") return false;
    const prereqs = prereqEdges.filter((e) => e.targetId === node.id).map((e) => e.sourceId);
    return prereqs.every((pId) => progressMap.get(pId) === "mastered");
  });

  if (recommended.length === 0) return { content: [{ type: "text" as const, text: "暂无推荐学习的节点" }] };

  const text = recommended.map((n) => `- [${n.id}] ${n.title}`).join("\n");
  return { content: [{ type: "text" as const, text: `推荐学习：\n${text}` }] };
});

server.tool("get_due_reviews", "获取待复习的知识", {}, async () => {
  const now = new Date();
  const rows = await db.select({
    progress: learningProgress, node: knowledgeNodes,
  }).from(learningProgress).innerJoin(knowledgeNodes, eq(learningProgress.nodeId, knowledgeNodes.id))
    .where(and(ne(learningProgress.status, "not_started"), lt(learningProgress.nextReviewAt, now)));

  if (rows.length === 0) return { content: [{ type: "text" as const, text: "暂无待复习的知识" }] };

  const text = rows.map(({ node: n, progress: p }) => `- ${n.title} (状态: ${p.status}，上次复习: ${p.lastReviewedAt ? new Date(p.lastReviewedAt).toLocaleDateString("zh-CN") : "无"})`).join("\n");
  return { content: [{ type: "text" as const, text: `待复习（${rows.length} 个）：\n${text}` }] };
});

// ============ 考试系统工具 ============

server.tool("list_questions", "列出题目（可选按知识节点过滤）", { nodeId: z.string().optional() }, async ({ nodeId }) => {
  const qs = nodeId
    ? await db.select().from(questions).where(eq(questions.nodeId, nodeId))
    : await db.select().from(questions);

  if (qs.length === 0) return { content: [{ type: "text" as const, text: "暂无题目" }] };

  const typeLabels: Record<string, string> = { choice: "选择题", fill: "填空题", short_answer: "简答题" };
  const text = qs.map((q) => `- [${q.id}] (${typeLabels[q.type]}/难度${q.difficulty}) ${q.content}`).join("\n");
  return { content: [{ type: "text" as const, text: `共 ${qs.length} 道题：\n${text}` }] };
});

server.tool(
  "create_question",
  "创建题目",
  {
    nodeId: z.string(), type: z.enum(["choice", "fill", "short_answer"]),
    content: z.string(), options: z.array(z.string()).optional(),
    answer: z.string(), explanation: z.string().optional(), difficulty: z.number().optional(),
  },
  async ({ nodeId, type, content, options, answer, explanation, difficulty }) => {
    const id = randomUUID();
    await db.insert(questions).values({
      id, nodeId, type, content, options: options ?? [], answer,
      explanation: explanation ?? "", difficulty: difficulty ?? 1, createdAt: new Date(),
    });
    const typeLabels: Record<string, string> = { choice: "选择题", fill: "填空题", short_answer: "简答题" };
    return { content: [{ type: "text" as const, text: `已创建${typeLabels[type]}：[${id}] ${content}` }] };
  }
);

server.tool(
  "create_exam",
  "Create an exam from selected questions",
  {
    title: z.string(),
    questionIds: z.array(z.string()),
  },
  async ({ title, questionIds }) => {
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
);

server.tool("get_exam_stats", "查看考试记录和成绩", {}, async () => {
  const exams = await db.select().from(examResults);
  if (exams.length === 0) return { content: [{ type: "text" as const, text: "暂无考试记录" }] };

  const text = exams.map((e) =>
    `- ${e.title}: ${e.totalScore ?? "未完成"}/${e.maxScore ?? 0} (${new Date(e.createdAt).toLocaleDateString("zh-CN")})`
  ).join("\n");
  return { content: [{ type: "text" as const, text: `考试记录（${exams.length} 次）：\n${text}` }] };
});

// ============ 启动 ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
