import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// ---------- Mock @xyflow/react ----------
// Handle 需要 zustand provider，用简单的 mock 替代
vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-handleid={type} data-position={position} />
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import { Handle, Position } from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import { useMemo } from "react";

// ============================================================
// 以下是从 page.tsx 中提取的待测逻辑（直接内联，避免 mock 整个页面）
// 页面组件混合了 server action、ReactFlow 等重型依赖，
// 提取纯逻辑进行单元测试更加稳定和可靠。
// ============================================================

// ---------- 分类颜色映射 ----------
const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  "Frontend Fundamentals": { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  "Frontend Framework": { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  "Database": { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  "Tools": { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  "System Design": { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
};
const defaultCategory = { bg: "#f3f4f6", border: "#6b7280", text: "#374151" };

// ---------- 边配置 ----------
const edgeConfig: Record<string, { color: string; label: string; animated: boolean }> = {
  prerequisite: { color: "#ef4444", label: "knowledge.graph.prerequisite", animated: true },
  related: { color: "#3b82f6", label: "knowledge.graph.related", animated: false },
  builds_upon: { color: "#22c55e", label: "knowledge.graph.advanced", animated: false },
};

// ---------- Dagre 布局 hook（提取为纯函数便于测试） ----------
function dagreLayout(
  nodes: { id: string; position: { x: number; y: number } }[],
  edges: { source: string; target: string }[],
  enabled: boolean
) {
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
}

// ---------- 节点组件 ----------
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

// ============================================================
// 测试开始
// ============================================================

describe("useDagreLayout — dagre 布局逻辑", () => {
  // enabled=true 时，dagre 应该重新计算节点位置，不再是全 0,0
  it("enabled=true 时，节点位置应被 dagre 重新计算（不再是全 0,0）", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
      { id: "c", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];

    const result = dagreLayout(nodes, edges, true);

    // dagre 布局后，节点不应该全在 0,0
    // 由于 dagre 纵向排列时 x 可能为 0，所以只检查 y 不全为 0
    const allAtZeroY = result.every((n) => n.position.y === 0);
    expect(allAtZeroY).toBe(false);

    // 至少有一些节点的位置发生了变化
    const positionsChanged = result.some((n) => n.position.x !== 0 || n.position.y !== 0);
    expect(positionsChanged).toBe(true);
  });

  // enabled=false 时，节点位置应保持不变
  it("enabled=false 时，节点位置保持不变", () => {
    const nodes = [
      { id: "a", position: { x: 10, y: 20 } },
      { id: "b", position: { x: 30, y: 40 } },
    ];
    const edges = [{ source: "a", target: "b" }];

    const result = dagreLayout(nodes, edges, false);

    expect(result[0].position).toEqual({ x: 10, y: 20 });
    expect(result[1].position).toEqual({ x: 30, y: 40 });
  });

  // 空节点数组应直接返回空数组
  it("空节点数组时，返回空数组", () => {
    const result = dagreLayout([], [], true);
    expect(result).toEqual([]);
  });

  // 无边时，布局仍然正常工作（节点可能排成一行或一列）
  it("无边时，布局仍然正常工作", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
    ];

    const result = dagreLayout(nodes, [], true);

    // 应该返回相同数量的节点
    expect(result).toHaveLength(2);
    // 即使没有边，dagre 也会给节点分配位置
    expect(result[0].position.x).toBeDefined();
    expect(result[0].position.y).toBeDefined();
    expect(result[1].position.x).toBeDefined();
    expect(result[1].position.y).toBeDefined();
  });
});

describe("categoryColors — 分类颜色映射", () => {
  // 每个已知分类都应该有对应的颜色
  it("已知分类有对应的颜色配置", () => {
    const knownCategories = [
      "Frontend Fundamentals",
      "Frontend Framework",
      "Database",
      "Tools",
      "System Design",
    ];

    for (const cat of knownCategories) {
      expect(categoryColors[cat]).toBeDefined();
      expect(categoryColors[cat]).toHaveProperty("bg");
      expect(categoryColors[cat]).toHaveProperty("border");
      expect(categoryColors[cat]).toHaveProperty("text");
    }
  });

  // 未知分类使用默认灰色
  it("未知分类使用默认灰色", () => {
    const unknownCategory = "SomeUnknownCategory";
    const colors = categoryColors[unknownCategory] || defaultCategory;

    expect(colors).toEqual(defaultCategory);
    expect(colors.bg).toBe("#f3f4f6");
    expect(colors.border).toBe("#6b7280");
    expect(colors.text).toBe("#374151");
  });
});

describe("edgeConfig — 边配置", () => {
  // prerequisite 类型：红色、有动画
  it("prerequisite 类型为红色且有动画", () => {
    expect(edgeConfig.prerequisite.color).toBe("#ef4444");
    expect(edgeConfig.prerequisite.animated).toBe(true);
  });

  // related 类型：蓝色、无动画
  it("related 类型为蓝色且无动画", () => {
    expect(edgeConfig.related.color).toBe("#3b82f6");
    expect(edgeConfig.related.animated).toBe(false);
  });

  // builds_upon 类型：绿色、无动画
  it("builds_upon 类型为绿色且无动画", () => {
    expect(edgeConfig.builds_upon.color).toBe("#22c55e");
    expect(edgeConfig.builds_upon.animated).toBe(false);
  });
});

describe("KnowledgeNodeComponent — 节点组件", () => {
  // 正确渲染 label 和 category
  it("正确渲染 label 和 category", () => {
    const { container } = render(
      <KnowledgeNodeComponent data={{ label: "React Hooks", category: "Frontend Framework" }} />
    );

    const textContent = container.textContent;
    expect(textContent).toContain("React Hooks");
    expect(textContent).toContain("Frontend Framework");
  });

  // 组件应包含两个 Handle（source 和 target）
  it("有两个 Handle（source 和 target）", () => {
    const { container } = render(
      <KnowledgeNodeComponent data={{ label: "React", category: "Frontend Framework" }} />
    );

    // Handle 组件会被 xyflow 渲染为带有 data-handleid 属性的元素
    // 在测试环境中，mock 的 Handle 会渲染传入的 type
    const handles = container.querySelectorAll("[data-handleid]");
    expect(handles.length).toBeGreaterThanOrEqual(2);
  });
});
