# Figma 与 React 设计规则

本文件只负责 UI 设计协作。项目执行规则先读 `AGENTS.md`，真实前端源码始终是 `frontend-react/`。

Figma Make 只提供页面结构、视觉层级、间距、颜色、卡片、表格密度和组件意图。不得用 Make 导出覆盖 React 应用，也不得把 mock data 复制成生产数据。

## 设计参考

- 成绩页主要参考：<https://www.figma.com/make/1QpH5tRbV2oVGkSKN8tDph/%E4%BC%98%E5%8C%96%E6%88%90%E7%BB%A9%E9%A1%B5%E9%9D%A2%E8%AE%BE%E8%AE%A1>
- 整体应用视觉参考：<https://www.figma.com/make/T89q98PawNHmuhwiEPbBHY/Redesign-Seat-Management-System>

前者用于成绩看板的信息架构；后者用于座位、成绩和评语工作台的整体浅色仪表盘风格。需要读取 Make 上下文时使用 URL 中 `/make/` 后的 file key，并从节点 `0:1` 开始。

## 实现边界

1. 在现有 React 组件和状态边界内实现设计，不创建包裹旧页面的新壳。
2. 优先复用现有组件、设计 token 和交互模式；只在明确边界内提取新组件。
3. 保留座位操作、学生管理、成绩导入与统计、AI 评语、备份同步、登录和 PWA 行为。
4. AI 建议必须由教师确认后才能写入业务数据。
5. 不修改根 `index.html` 来实现产品页面；CI 只发布 `frontend-react/` 构建产物。
6. 不把 API key、产品码、管理员 token 或 Worker-only 配置放进前端。

## 视觉系统

- 浅灰白页面背景，白色或近白卡片。
- 轻边框、柔和阴影和统一圆角。
- 按钮高度、表格行高和页面间距保持一致。
- 字体紧凑但可读，主要操作与次要操作层级清楚。
- 不重新混入旧 glassmorphism 风格。

## 成绩页目标

- 左侧轻量导航负责考试、科目、导入、历史和评语工作台入口。
- 右侧看板包含标题、趋势切换、指标卡、图表、分布卡和学生成绩表。
- 不把考试选择、指标选择和完整表格操作全部挤在同一标题行。

## UI 修改验收

```bash
cd frontend-react
pnpm check
pnpm build:zhang
pnpm build:commercial
```

涉及登录、持久数据、响应式交互或 PWA 时，再运行 `pnpm test:e2e`。
