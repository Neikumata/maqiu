import { describe, it, expect } from "vitest";
import dict, { t, DictKey } from "../zh";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * 递归收集目录下所有匹配后缀的文件路径（相对于 baseDir）
 */
function collectFiles(baseDir: string, suffix: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(suffix)) {
        results.push(fullPath);
      }
    }
  }

  walk(baseDir);
  return results;
}

// ============================================================
// 一、t() 函数测试
// ============================================================

describe("t() 函数", () => {
  // ----------------------------------------------------------
  // 1. 基础用法：传入存在的 key，返回对应的中文值
  // ----------------------------------------------------------
  it("传入存在的 key，应返回对应的中文值", () => {
    expect(t("app.name")).toBe("麻球");
    expect(t("app.tagline")).toBe("知识库 · 学习系统 · 考试系统");
    expect(t("nav.knowledge")).toBe("知识库");
    expect(t("dashboard.title")).toBe("仪表盘");
    expect(t("dashboard.nodes")).toBe("知识节点");
    expect(t("exam.questions.choice")).toBe("选择题");
  });

  // ----------------------------------------------------------
  // 2. 参数插值（单个参数）：替换模板中的占位符
  // ----------------------------------------------------------
  it("支持参数插值，如 exam.detail.result", () => {
    expect(t("exam.detail.result", { score: 80, max: 100 })).toBe(
      "考试结果：80 / 100 分"
    );
  });

  // ----------------------------------------------------------
  // 3. 参数插值（多个参数）：同时替换多个占位符
  // ----------------------------------------------------------
  it("支持多个参数插值，如 exam.detail.result", () => {
    expect(t("exam.detail.result", { score: 80, max: 100 })).toBe(
      "考试结果：80 / 100 分"
    );
    expect(t("exam.detail.correct", { count: 5, wrong: 3 })).toBe(
      "答对 5 题，答错 3 题"
    );
    expect(t("exam.create.select", { count: 10 })).toBe("选择题目（已选 10 题）");
  });

  // ----------------------------------------------------------
  // 4. 不传 params 时，返回原始字符串不做任何修改
  // ----------------------------------------------------------
  it("不传 params 时，不改变原文", () => {
    // 选择一个没有占位符的 key
    expect(t("app.name")).toBe("麻球");
    expect(t("dashboard.title")).toBe("仪表盘");
    expect(t("nav.label")).toBe("导航");
    // 选择一个有占位符的 key 但不传参数，占位符应保持原样
    expect(t("exam.detail.result")).toBe("考试结果：{score} / {max} 分");
  });

  // ----------------------------------------------------------
  // 5. 参数值为字符串类型时也能正确替换
  // ----------------------------------------------------------
  it("参数值为字符串时也能正确替换", () => {
    expect(t("exam.detail.result", { score: "N/A", max: 100 })).toBe("考试结果：N/A / 100 分");
  });
});

// ============================================================
// 二、DictKey 类型测试
// ============================================================

describe("DictKey 类型", () => {
  // ----------------------------------------------------------
  // 验证 DictKey 是否正确导出——通过检查 dict 的 key 是否可
  // 以作为 t() 的参数来间接验证类型正确性
  // ----------------------------------------------------------
  it("dict 对象的 key 应与 DictKey 类型一致", () => {
    const keys = Object.keys(dict) as DictKey[];
    // 验证每个 key 都能通过 t() 取得非空字符串
    for (const key of keys) {
      const value = t(key);
      expect(value).toBeTruthy();
      expect(typeof value).toBe("string");
    }
  });

  // ----------------------------------------------------------
  // 验证一些关键 key 确实存在于 DictKey 类型中
  // ----------------------------------------------------------
  it("包含所有预期的关键 key", () => {
    const keys = Object.keys(dict);
    // Layout 相关
    expect(keys).toContain("app.name");
    expect(keys).toContain("app.tagline");
    expect(keys).toContain("nav.knowledge");
    expect(keys).toContain("nav.learn");
    expect(keys).toContain("nav.exam");
    // Dashboard
    expect(keys).toContain("dashboard.title");
    expect(keys).toContain("dashboard.nodes");
    // Knowledge
    expect(keys).toContain("knowledge.title");
    expect(keys).toContain("knowledge.graph.view");
    expect(keys).toContain("knowledge.new");
    // Learn
    expect(keys).toContain("learn.title");
    expect(keys).toContain("learn.mastered");
    // Exam
    expect(keys).toContain("exam.title");
    expect(keys).toContain("exam.create");
  });
});

// ============================================================
// 三、dict 对象的值测试
// ============================================================

describe("dict 对象的值", () => {
  // ----------------------------------------------------------
  // 验证 dict 中所有值都是非空字符串
  // ----------------------------------------------------------
  it("所有值都是非空字符串", () => {
    for (const [key, value] of Object.entries(dict)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  // ----------------------------------------------------------
  // 验证 dict 的条目数量在合理范围内（至少 100 条）
  // ----------------------------------------------------------
  it("dict 包含足够多的条目", () => {
    const keys = Object.keys(dict);
    expect(keys.length).toBeGreaterThanOrEqual(100);
  });
});

// ============================================================
// 四、页面文件中无残留中文（硬编码中文字符串）
// ============================================================

describe("页面文件中无残留中文", () => {
  // 项目根目录：从 __tests__ 向上到达项目根（src/lib/i18n/__tests__ → 5 级）
  const projectRoot = path.resolve(__dirname, "../../../..");
  const chineseCharPattern = /[一-鿿]/;
  // html lang="zh-CN" 或 lang='zh-CN' 是允许的，应排除
  const htmlLangPattern = /lang\s*=\s*["']zh-CN["']/;

  /**
   * 检查文件内容中是否有硬编码中文，返回违规行信息
   */
  function findChineseViolations(
    filePath: string,
    displayPath: string
  ): string[] {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 跳过 html lang="zh-CN" 属性行
      if (htmlLangPattern.test(line)) {
        continue;
      }

      // 去掉单行注释后再检测
      const codeOnly = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (chineseCharPattern.test(codeOnly)) {
        violations.push(`${displayPath}:${i + 1}: ${line.trim()}`);
      }
    }

    return violations;
  }

  // ----------------------------------------------------------
  // 1. 扫描 src/app/ 下所有 page.tsx 文件
  // ----------------------------------------------------------
  it("src/app/ 下所有 page.tsx 不应包含硬编码的中文字符", () => {
    const appDir = path.join(projectRoot, "src/app");
    const pageFiles = collectFiles(appDir, "page.tsx");

    expect(pageFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const fullPath of pageFiles) {
      const relPath = path.relative(projectRoot, fullPath);
      violations.push(...findChineseViolations(fullPath, relPath));
    }

    if (violations.length > 0) {
      console.error("以下位置发现硬编码中文：");
      violations.forEach((v) => console.error("  " + v));
    }

    expect(violations).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 2. 扫描布局文件 src/components/app-layout.tsx
  // ----------------------------------------------------------
  it("src/components/app-layout.tsx 不应包含硬编码的中文字符", () => {
    const layoutPath = path.join(projectRoot, "src/components/app-layout.tsx");
    const violations = findChineseViolations(
      layoutPath,
      "src/components/app-layout.tsx"
    );

    if (violations.length > 0) {
      console.error("以下位置发现硬编码中文：");
      violations.forEach((v) => console.error("  " + v));
    }

    expect(violations).toHaveLength(0);
  });
});
