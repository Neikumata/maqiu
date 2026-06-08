"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node as RFNode,
  type Edge as RFEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { listNodes, getAllEdges } from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

type KnowledgeNode = {
  id: string;
  title: string;
  category: string | null;
};

type KnowledgeEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "prerequisite" | "related" | "builds_upon";
};

const edgeColorMap: Record<string, string> = {
  prerequisite: "#ef4444",
  related: "#3b82f6",
  builds_upon: "#22c55e",
};

export default function KnowledgeGraphPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [nodeList, edgeList] = await Promise.all([
      listNodes(),
      getAllEdges(),
    ]);

    const knodes = nodeList as KnowledgeNode[];
    const kedges = edgeList as KnowledgeEdge[];

    const radius = Math.max(200, knodes.length * 30);
    const rfNodes: RFNode[] = knodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / knodes.length;
      return {
        id: n.id,
        position: {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        },
        data: { label: n.title },
        style: {
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
        },
      };
    });

    const rfEdges: RFEdge[] = kedges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      style: { stroke: edgeColorMap[e.type] || "#999" },
      label: e.type,
      animated: e.type === "prerequisite",
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
    setLoading(false);
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">{t("knowledge.graph.title")}</h1>
        <p className="text-muted-foreground">{t("knowledge.graph.loading")}</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t("knowledge.graph.title")}</h1>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500 inline-block" /> {t("knowledge.graph.prerequisite")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500 inline-block" /> {t("knowledge.graph.related")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-500 inline-block" /> {t("knowledge.graph.advanced")}
          </span>
        </div>
      </div>
      <div className="w-full h-full border rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
