# Codex 交接入口

更新时间：2026-09-26。

本文件只说明当前可依赖的项目状态，不记录单次会话的“待推送”或临时排障进度。

## 开始工作

按顺序阅读：

1. `AGENTS.md`：必须遵守的兼容、安全和验证规则。
2. `docs/ARCHITECTURE.md`：模块、数据、edition、AI 与 PWA 架构。
3. `docs/OPERATIONS.md`：本地验证、发布面和排障顺序。
   发布或规划功能前同时阅读 `docs/VERSION_GOVERNANCE.md`；维护优先级见 `docs/MAINTENANCE_PLAN.md`。
4. UI 工作再读 `docs/DESIGN_SYSTEM.md`；Worker 细节再读 `cloudflare-worker/README.md`。

## 当前事实

- `frontend-react/` 是唯一真实前端源码，构建产物不提交。
- `SeatManagerController` 持有唯一持久 `SeatManagerState`；不要重新创建 students/seatOrder 等平行副本。
- `AiApiClient` 统一 AI auth 与代理 fallback；不要在新 service 再复制 token 存储逻辑。
- React PWA 支持 Zhang `/seat-manager/` 和 Commercial `/`，更新由用户确认。
- Worker 公共路由在 `cloudflare-worker/worker-routes.js`，Netlify 代理复用并有契约测试。
- 工作区页面集中在 `components/workspaces/`，宿舍主协调组件仍在 `components/DormitoryWorkspace.tsx`；成绩、宿舍、班费、历史、名单/备份、AI Assistant 和 Comment Workbench 按需加载，复用 `RetryableLazy`。
- App 的学生、宿舍、班费更新分别在 `hooks/use*Actions.ts`；宿舍列表/成员区已是独立组件，AI Assistant payload/result 已从 facade 分离。
- 学生姓名与别名搜索统一走 `state/studentSearch.ts`，CSV 转义与下载统一走 `state/csv.ts`，页面不要再复制同类逻辑。
- 成绩阈值与宿舍事件偏好保存在当前切片 `settings`，会随备份和手动云同步迁移；旧宿舍全局键只作为首次兼容读取源。
- 弹窗焦点约束与状态反馈分别复用 `useModalFocus`、`InlineStatus`；高风险删除优先保留审计记录，并提供短时撤销。
- Worker 的同步、产品授权、授权管理与 AI handler 均由 `routes/` 对应领域持有，`worker-app.js` 只负责装配。维护分支已修复整柜 `workspaceBook` 被遗漏、删除授权后协调器仍保留旧记录两项问题；尚未发布，勿把本地修复当作线上行为。
- 宿舍事件和学生资料编辑会话已进入专用 hook；评语的共享草稿、单人编辑、批量队列分别由 `useCommentDrafts`、`useCommentEditor`、`useCommentBatch` 管理。页面保留原布局和交互，草稿缓存与正式保存边界保持兼容。
- GitHub Pages、Commercial Pages 和 Worker workflow 发布前都会运行自动检查。

## 修改后的最低验收

```bash
cd frontend-react
pnpm check:design
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build:zhang
pnpm check:size
pnpm build:commercial
pnpm check:size
pnpm check:production
pnpm test:e2e:all

cd ../cloudflare-worker
npm run check

cd ..
node --test .github/scripts/verify-zhang-release.test.mjs
```

涉及登录、持久数据或 PWA 时，两种 edition 都要运行 `pnpm test:e2e:all`。涉及 Worker 配置时，增加 Wrangler dry-run。线上部署不是普通本地修改的默认步骤。

## 已知边界

- 多班级云同步仍是整个 workspace book 手动覆盖，上限 5 MiB。
- 订阅计费、自动续费和实时同步没有实现，也不应在普通维护中顺带引入。
- 宿舍关闭编辑保留缓存草稿，学生资料取消编辑丢弃未保存修改，两者业务语义刻意保持不同；AI 评语只生成草稿，老师显式保存后才进入正式数据。后续修改继续沿专用 hook/action/storage 边界验证，禁止一次性重写。
- `promo-video/` 是为独立宣传工程保留的忽略路径；当前主仓库不依赖该目录。
