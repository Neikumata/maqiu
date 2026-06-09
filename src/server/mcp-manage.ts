"use server";

import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";

export async function getMcpStats() {
  const nodeCount = (await db.select().from(knowledgeNodes)).length;
  const edgeCount = (await db.select().from(knowledgeEdges)).length;

  return { nodeCount, edgeCount };
}
