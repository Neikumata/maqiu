# Changelog

## 0.0.4 - 2026-06-09

### 修复

- **update_knowledge 增加存在性校验**：更新前检查 ID 是否存在，不存在时返回明确错误而非静默失败
- **修复进程联动关闭**：MCP server 进程管理优化

### 改进

- **知识库内容录入**：通过 MCP agent 并行录入 Next.js 官方文档 74 个知识点，覆盖 Getting Started 全部章节
- **知识库标签统一**：所有知识点 tags 统一为 `[主题分类, 具体内容]` 格式，去掉冗余的 nextjs 标签
- **知识库分类统一**：所有知识点 category 统一为 `Next.js`
- **知识库去重**：清理 8 个重复知识点

## 0.0.3 - 2026-06-09

### 改进

- 修复复习时间计算和推荐逻辑

## 0.0.2 - 2026-06-08

### 改进

- **知识图谱**：使用 Dagre 自动布局、按分类着色节点、自定义节点组件、边标签与动画、搜索过滤、图例
- **知识节点去重**：创建节点时检查标题重复，MCP 和 Server Action 双重防护
- **测试**：新增图谱页面组件测试，vitest 切换到 jsdom 环境支持 React 组件测试

### 依赖

- 新增 `@dagrejs/dagre`、`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`

## 0.0.1 - 2026-06-08

### 新增

- 项目初始化：README、CLAUDE.md、.gitignore
- **知识库**：知识节点 CRUD、关联管理、图谱可视化（React Flow）、Markdown 编辑
- **学习系统**：学习状态管理、路径推荐、间隔复习调度、进度仪表盘
- **考试系统**：题库管理、组卷考试、即时判分、错题反哺知识库
- **MCP Server**：15 个工具，覆盖知识库/学习/考试三个系统
- **Claude Code Agent**：`/maqiu` 技能，通过 MCP 直接操作系统
- **MCP 管理页**：Web 端启动/停止 MCP server，查看日志和配置
- **国际化（i18n）**：中文文本提取到字典文件，避免 Turbopack 代码高亮 bug
- **侧边栏导航**：知识库、学习、考试、MCP 四个模块
- **测试**：133 个测试用例，覆盖数据库 CRUD、Server Actions、MCP 工具、i18n
