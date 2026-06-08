"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node as RFNode,
  type Edge as RFEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import { listNodes, getAllEdges } from "@/server/knowledge";
import { t, type DictKey } from "@/lib/i18n/zh";
import { Button } from "@/components/ui/button";

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

const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  "Frontend Fundamentals": { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  "Frontend Framework": { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  "Database": { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  "Tools": { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  "System Design": { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
};
const defaultCategory = { bg: "#f3f4f6", border: "#6b7280", text: "#374151" };

const edgeConfig: Record<string, { color: string; label: DictKey; animated: boolean }> = {
  prerequisite: { color: "#ef4444", label: "knowledge.graph.prerequisite", animated: true },
  related: { color: "#3b82f6", label: "knowledge.graph.related", animated: false },
  builds_upon: { color: "#22c55e", label: "knowledge.graph.advanced", animated: false },
};

function KnowledgeNodeComponent({ data }: { data: { label: string; category: string } }) {
  const colors = categoryColors[data.category] || defaultCategory;
  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 10,
        padding: "8px 16px",
        minWidth: 100,
        maxWidth: 180,
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
        {data.label}
      </div>
      {data.category && (
        <div style={{ fontSize: 9, color: colors.text, opacity: 0.7, marginTop: 2 }}>
          {data.category}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}

const nodeTypes = { knowledgeNode: KnowledgeNodeComponent };

function useDagreLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  enabled: boolean
): RFNode[] {
  return useMemo(() => {
    if (!enabled || nodes.length === 0) return nodes;
    const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
    for (const node of nodes) {
      g.setNode(node.id, { width: 160, height: 50 });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }
    Dagre.layout(g);
    return nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - 80, y: pos.y - 25 },
      };
    });
  }, [nodes, edges, enabled]);
}

export default function KnowledgeGraphPage() {
  const [rawNodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesState] = useEdgesState<RFEdge>([]);
  const [loading, setLoading] = useState(true);
  const [autoLayout, setAutoLayout] = useState(true);

  const nodes = useDagreLayout(rawNodes, edges, autoLayout);

  const loadData = useCallback(async () => {
    const [nodeList, edgeList] = await Promise.all([
      listNodes(),
      getAllEdges(),
    ]);

    const knodes = nodeList as KnowledgeNode[];
    const kedges = edgeList as KnowledgeEdge[];

    const rfNodes: RFNode[] = knodes.map((n) => ({
      id: n.id,
      position: { x: 0, y: 0 },
      type: "knowledgeNode",
      data: { label: n.title, category: n.category || "" },
    }));

    const rfEdges: RFEdge[] = kedges.map((e) => {
      const cfg = edgeConfig[e.type] || { color: "#999", label: "knowledge.graph.related" as DictKey, animated: false };
      return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        style: { stroke: cfg.color, strokeWidth: 2 },
        label: t(cfg.label),
        labelStyle: { fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: "white", fillOpacity: 0.9 },
        animated: cfg.animated,
        type: "smoothstep" as const,
      };
    });

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
        <div className="flex items-center gap-4">
          <Button
            variant={autoLayout ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoLayout(!autoLayout)}
          >
            {autoLayout ? "Auto Layout: ON" : "Auto Layout: OFF"}
          </Button>
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
      </div>
      <div className="w-full h-full border rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesState}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
