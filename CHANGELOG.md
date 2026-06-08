# Changelog

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
