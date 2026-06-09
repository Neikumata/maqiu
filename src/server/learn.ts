"use server";

import { db } from "@/lib/db";
import {
  learningProgress,
  knowledgeNodes,
  knowledgeEdges,
} from "@/lib/db/schema";
import { eq, and, lt, ne } from "drizzle-orm";
import { randomUUID } from "crypto";

type ProgressStatus =
  | "not_started"
  | "learning"
  | "mastered"
  | "needs_review";

export async function getProgress(nodeId: string) {
  const rows = await db
    .select()
    .from(learningProgress)
    .where(eq(learningProgress.nodeId, nodeId));
  return rows[0] ?? null;
}

export async function getAllProgress() {
  return db.select().from(learningProgress);
}

export async function initProgress(nodeId: string) {
  const existing = await getProgress(nodeId);
  if (existing) return existing;
  const id = randomUUID();
  await db.insert(learningProgress).values({
    id,
    nodeId,
    status: "not_started",
    createdAt: new Date(),
  });
  return getProgress(nodeId);
}

export async function updateProgress(
  nodeId: string,
  data: {
    status?: ProgressStatus;
    score?: number;
  }
) {
  const existing = await getProgress(nodeId);
  const now = new Date();

  if (!existing) {
    const id = randomUUID();
    await db.insert(learningProgress).values({
      id,
      nodeId,
      status: data.status ?? "not_started",
      score: data.score ?? 0,
      reviewCount: 0,
      lastReviewedAt: now,
      nextReviewAt: calculateNextReview(data.status ?? "not_started", 0, now),
      createdAt: now,
    });
  } else {
    const newReviewCount =
      existing.reviewCount + (data.status === "mastered" ? 1 : 0);
    await db
      .update(learningProgress)
      .set({
        status: data.status ?? existing.status,
        score: data.score ?? existing.score,
        lastReviewedAt: now,
        reviewCount: newReviewCount,
        // 使用 existing.reviewCount 来计算间隔（递增前的值）
        // 第1次 mastered: reviewCount=0 -> 用 intervals[0]=1天
        // 第2次 mastered: reviewCount=1 -> 用 intervals[1]=3天
        nextReviewAt: calculateNextReview(
          data.status ?? existing.status,
          existing.reviewCount,
          now
        ),
      })
      .where(eq(learningProgress.nodeId, nodeId));
  }
  return getProgress(nodeId);
}

function calculateNextReview(
  status: ProgressStatus,
  reviewCount: number,
  now: Date = new Date()
): Date | null {
  if (status === "mastered") {
    // 间隔复习：1天、3天、7天、14天、30天
    const intervals = [1, 3, 7, 14, 30];
    const days = intervals[Math.min(reviewCount, intervals.length - 1)];
    // 使用时间戳计算，避免 setDate 的边界问题
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }
  if (status === "needs_review") {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}

export async function getDueReviews() {
  const now = new Date();
  return db
    .select({
      progress: learningProgress,
      node: knowledgeNodes,
    })
    .from(learningProgress)
    .innerJoin(knowledgeNodes, eq(learningProgress.nodeId, knowledgeNodes.id))
    .where(
      and(
        ne(learningProgress.status, "not_started"),
        lt(learningProgress.nextReviewAt, now)
      )
    );
}

export async function getRecommendedNext() {
  // 找到所有 not_started 的节点，且其前置知识已经 mastered
  const allNodes = await db.select().from(knowledgeNodes);
  const allProgress = await db.select().from(learningProgress);
  const allEdges = await db.select().from(knowledgeEdges);

  const progressMap = new Map(allProgress.map((p) => [p.nodeId, p.status]));
  const prerequisiteEdges = allEdges.filter((e) => e.type === "prerequisite");

  const recommended: string[] = [];

  for (const node of allNodes) {
    const status = progressMap.get(node.id);
    if (status && status !== "not_started") continue;

    // 检查所有前置知识是否已 mastered
    const prereqs = prerequisiteEdges
      .filter((e) => e.targetId === node.id)
      .map((e) => e.sourceId);

    const allPrereqsMastered = prereqs.every(
      (pId) => progressMap.get(pId) === "mastered"
    );

    if (allPrereqsMastered) {
      recommended.push(node.id);
    }
  }

  return recommended;
}
