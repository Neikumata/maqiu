"use server";

import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";
import { eq, like, or } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function createNode(data: {
  title: string;
  content?: string;
  category?: string;
  tags?: string[];
}) {
  const existing = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.title, data.title));
  if (existing.length > 0) {
    return existing[0].id;
  }

  const id = randomUUID();
  const now = new Date();
  await db.insert(knowledgeNodes).values({
    id,
    title: data.title,
    content: data.content ?? "",
    category: data.category ?? "",
    tags: data.tags ?? [],
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateNode(
  id: string,
  data: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
  }
) {
  await db
    .update(knowledgeNodes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(knowledgeNodes.id, id));
}

export async function deleteNode(id: string) {
  await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id));
}

export async function getNode(id: string) {
  const rows = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, id));
  return rows[0] ?? null;
}

export async function listNodes(search?: string) {
  if (search) {
    return db
      .select()
      .from(knowledgeNodes)
      .where(
        or(
          like(knowledgeNodes.title, `%${search}%`),
          like(knowledgeNodes.category, `%${search}%`)
        )
      );
  }
  return db.select().from(knowledgeNodes);
}

export async function createEdge(data: {
  sourceId: string;
  targetId: string;
  type: "prerequisite" | "related" | "builds_upon";
}) {
  const id = randomUUID();
  await db.insert(knowledgeEdges).values({
    id,
    sourceId: data.sourceId,
    targetId: data.targetId,
    type: data.type,
  });
  return id;
}

export async function deleteEdge(id: string) {
  await db.delete(knowledgeEdges).where(eq(knowledgeEdges.id, id));
}

export async function getNodeEdges(nodeId: string) {
  const outgoing = await db
    .select()
    .from(knowledgeEdges)
    .where(eq(knowledgeEdges.sourceId, nodeId));
  const incoming = await db
    .select()
    .from(knowledgeEdges)
    .where(eq(knowledgeEdges.targetId, nodeId));
  return { outgoing, incoming };
}

export async function getAllEdges() {
  return db.select().from(knowledgeEdges);
}
