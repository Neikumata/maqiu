# maqiu

个人学习与成长系统。核心理念：**先人后 AI**。

## 为什么叫麻球

麻球，外表金黄酥脆，内里空心。AI 用着爽，但如果自己没有真本事，一切成果都是空心的。

## 功能

### 知识库

组织和管理知识节点，建立知识之间的关联。

- 知识节点 CRUD（标题、内容、分类、标签）
- 知识关联（前置知识、相关知识、进阶知识）
- 知识图谱可视化
- Markdown 内容编辑和渲染
- 搜索

### 学习系统

沿着知识关联学习，追踪进度。

- 学习状态管理（未开始、学习中、已掌握、需复习）
- 学习路径推荐（基于前置知识关系）
- 间隔复习调度（1/3/7/14/30 天递增）
- 进度仪表盘

### 考试系统

测试逻辑理解，发现薄弱环节。

- 题库管理（选择题、填空题、简答题，关联知识节点）
- 组卷考试
- 即时判分和解析
- 错题反哺知识库（答错的节点自动标记为「需复习」）

### MCP Server

通过 Claude Code 的 `/maqiu` 技能直接操作系统，15 个工具：

- **知识库**：search_knowledge / get_knowledge / create_knowledge / update_knowledge / delete_knowledge / link_knowledge / unlink_knowledge
- **学习**：get_learning_status / update_learning_status / get_recommended / get_due_reviews
- **考试**：list_questions / create_question / create_exam / get_exam_stats

## 技术栈

| 用途 | 选择 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| 数据库 | SQLite (libsql) |
| ORM | Drizzle |
| UI | Tailwind CSS + shadcn/ui |
| 知识图谱 | React Flow |
| MCP | @modelcontextprotocol/sdk |

## 启动

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## MCP / Agent 使用

项目配置了 maqiu agent（`.claude/agents/maqiu.md`），通过 MCP server 连接数据库。

在 Claude Code 中输入 `/maqiu` 即可调用，例如：

```
/maqiu 创建一个关于 React Hooks 的知识节点
/maqiu 查看学习进度
/maqiu 为 React Hooks 创建考试题
```

## 核心理念

```
人的能力 × AI 辅助 = 产出
```

这是乘法关系，不是加法。人的能力是基数，AI 是乘数。基数为零，乘多大都是零。

- 会的东西，用 AI 是节省时间
- 不会的东西，用 AI 是埋雷
- 埋的雷早晚要爆，而且越晚爆越致命

所以：**先让自己会，再让 AI 快**。

## AI 使用原则

### 可以用 AI 的场景

- **已经掌握的技能** → 让 AI 加速执行，提升效率
- **重复性工作** → 让 AI 处理机械劳动，释放精力
- **信息检索** → 用 AI 查资料、找文档，但结论自己验证

### 必须自己来的场景

- **正在学习的东西** → 核心逻辑必须自己写、自己过一遍，AI 只做辅助解释
- **完全不懂的领域** → 禁止直接让 AI 生成代码/方案，先学会基础再说
- **架构和设计决策** → 必须自己想清楚，AI 只提供选项和利弊分析

### 底线规则

1. **AI 产出的每一行，必须能解释清楚为什么。** 解释不了 → 删掉，重新学
2. **不能为了速度牺牲理解。** 快但不理解 = 假进度
3. **遇到不懂的，停下来学，而不是让 AI 跳过。** 短期慢，长期快
4. **定期回顾：这段代码/这个方案，脱离 AI 我能不能独立完成？** 不能 → 补课

## 项目目标

1. 建立扎实的技术能力基础，不被 AI 的能力掩盖短板
2. 利用 AI 加速已掌握领域的执行效率
3. 形成可复用的学习方法论，让学习本身也越来越快
