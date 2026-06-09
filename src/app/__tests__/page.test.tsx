import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------- Mock 三个 server action ----------
const { mockGetMcpStats, mockListQuestions, mockGetAllProgress } = vi.hoisted(
  () => ({
    mockGetMcpStats: vi.fn(),
    mockListQuestions: vi.fn(),
    mockGetAllProgress: vi.fn(),
  })
);

vi.mock("@/server/mcp-manage", () => ({
  getMcpStats: mockGetMcpStats,
}));

vi.mock("@/server/exam", () => ({
  listQuestions: mockListQuestions,
}));

vi.mock("@/server/learn", () => ({
  getAllProgress: mockGetAllProgress,
}));

// ---------- Mock next/link ----------
// Next.js 的 Link 在 jsdom 中需要 mock，否则会有内部路由问题
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// 导入被测组件（必须在 mock 之后）
import Home from "@/app/page";

// ============================================================
// 测试开始
// ============================================================

describe("Dashboard 首页", () => {
  beforeEach(() => {
    // 清除之前测试的调用记录
    vi.clearAllMocks();
    // 默认 mock 返回空数据
    mockGetMcpStats.mockResolvedValue({ nodeCount: 0, edgeCount: 0 });
    mockListQuestions.mockResolvedValue([]);
    mockGetAllProgress.mockResolvedValue([]);
  });

  // ---------- 页面标题 ----------

  it("显示页面标题「仪表盘」", async () => {
    await act(async () => {
      render(<Home />);
    });

    // 标题在首次渲染时就应该存在（不依赖异步数据）
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "仪表盘"
    );
  });

  // ---------- 统计卡片初始状态（数据加载前显示 0） ----------

  it("数据加载前统计卡片显示 0", async () => {
    await act(async () => {
      render(<Home />);
    });

    // 初始状态下所有统计数字应为 0
    const statValues = screen.getAllByText("0");
    // 4 个统计卡片，每个都显示 0
    expect(statValues).toHaveLength(4);
  });

  // ---------- 数据加载后正确显示统计数字 ----------

  it("加载统计数据后正确显示各卡片数值", async () => {
    mockGetMcpStats.mockResolvedValue({ nodeCount: 12, edgeCount: 8 });
    mockListQuestions.mockResolvedValue([
      { id: "q1" },
      { id: "q2" },
      { id: "q3" },
    ]);
    mockGetAllProgress.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    await act(async () => {
      render(<Home />);
    });

    // 等待异步数据加载完成
    await waitFor(() => {
      expect(screen.getByText("12")).toBeInTheDocument();
    });

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // ---------- 统计卡片标签 ----------

  it("显示 4 个统计卡片的标签", async () => {
    await act(async () => {
      render(<Home />);
    });

    expect(screen.getByText("知识节点")).toBeInTheDocument();
    expect(screen.getByText("知识关联")).toBeInTheDocument();
    expect(screen.getByText("题目")).toBeInTheDocument();
    expect(screen.getByText("学习记录")).toBeInTheDocument();
  });

  // ---------- 模块导航卡片 ----------

  it("显示 3 个模块导航卡片", async () => {
    await act(async () => {
      render(<Home />);
    });

    expect(screen.getByText("知识库")).toBeInTheDocument();
    expect(screen.getByText("学习")).toBeInTheDocument();
    expect(screen.getByText("考试")).toBeInTheDocument();
  });

  it("导航卡片包含正确的链接地址", async () => {
    await act(async () => {
      render(<Home />);
    });

    const knowledgeLink = screen.getByRole("link", { name: /知识库/ });
    const learnLink = screen.getByRole("link", { name: /学习/ });
    const examLink = screen.getByRole("link", { name: /考试/ });

    expect(knowledgeLink).toHaveAttribute("href", "/knowledge");
    expect(learnLink).toHaveAttribute("href", "/learn");
    expect(examLink).toHaveAttribute("href", "/exam");
  });

  it("导航卡片显示对应的描述文字", async () => {
    await act(async () => {
      render(<Home />);
    });

    expect(
      screen.getByText("组织和管理知识，建立知识之间的关联")
    ).toBeInTheDocument();
    expect(
      screen.getByText("沿着知识关联学习，追踪进度，间隔复习")
    ).toBeInTheDocument();
    expect(
      screen.getByText("测试逻辑理解，发现薄弱环节")
    ).toBeInTheDocument();
  });

  // ---------- server action 调用验证 ----------

  it("组件挂载时调用三个 server action 获取数据", async () => {
    await act(async () => {
      render(<Home />);
    });

    await waitFor(() => {
      expect(mockGetMcpStats).toHaveBeenCalledTimes(1);
      expect(mockListQuestions).toHaveBeenCalledTimes(1);
      expect(mockGetAllProgress).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- 边界情况 ----------

  it("server action 返回空数据时页面正常渲染", async () => {
    mockGetMcpStats.mockResolvedValue({ nodeCount: 0, edgeCount: 0 });
    mockListQuestions.mockResolvedValue([]);
    mockGetAllProgress.mockResolvedValue([]);

    await act(async () => {
      render(<Home />);
    });

    await waitFor(() => {
      // 所有统计数字应为 0
      const zeros = screen.getAllByText("0");
      expect(zeros).toHaveLength(4);
    });
  });
});
