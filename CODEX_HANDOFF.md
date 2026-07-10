# Codex 交接入口

更新时间：2026-07-10。

本文件只说明当前可依赖的项目状态，不记录单次会话的“待推送”或临时排障进度。

## 开始工作

按顺序阅读：

1. `AGENTS.md`：必须遵守的兼容、安全和验证规则。
2. `docs/ARCHITECTURE.md`：模块、数据、edition、AI 与 PWA 架构。
3. `docs/OPERATIONS.md`：本地验证、发布面和排障顺序。
4. UI 工作再读 `DESIGN.md`；Worker 细节再读 `cloudflare-worker/README.md`。

## 当前事实

- `frontend-react/` 是唯一真实前端源码，构建产物不提交。
- `SeatManagerController` 持有唯一持久 `SeatManagerState`；不要重新创建 students/seatOrder 等平行副本。
- `AiApiClient` 统一 AI auth 与代理 fallback；不要在新 service 再复制 token 存储逻辑。
- React PWA 支持 Zhang `/seat-manager/` 和 Commercial `/`，更新由用户确认。
- Worker 公共路由在 `cloudflare-worker/worker-routes.js`，Netlify 代理复用并有契约测试。
- GitHub Pages、Commercial Pages 和 Worker workflow 发布前都会运行自动检查。

## 修改后的最低验收

```bash
cd frontend-react
pnpm check
pnpm build:zhang
pnpm build:commercial

cd ../cloudflare-worker
npm run check
```

涉及登录、持久数据或 PWA 时，再运行 `pnpm test:e2e`。涉及 Worker 配置时，增加 Wrangler dry-run。线上部署不是普通本地修改的默认步骤。

## 已知边界

- 多班级云同步仍是整个 workspace book 手动覆盖，上限 5 MiB。
- 订阅计费、自动续费和实时同步没有实现，也不应在普通维护中顺带引入。
- 核心大页面仍可按功能逐步提取子组件；必须先补对应测试，禁止一次性重写。
- `promo-video/` 是为独立宣传工程保留的忽略路径；当前主仓库不依赖该目录。
