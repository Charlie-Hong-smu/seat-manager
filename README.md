# 班级座位管理器

面向班主任的座位、学生档案、成绩、宿舍、班费和 AI 辅助管理工具。项目使用同一套 React 源码构建 Zhang 与 Commercial 两个版本。

Agent 开始工作时必须先读 [`AGENTS.md`](AGENTS.md)。长期说明按职责拆分：

- [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md)：当前稳定状态与接力顺序。
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：模块边界、数据流、双版本、AI 和 PWA。
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)：验证、发布和故障排查。
- [`DESIGN.md`](DESIGN.md)：Figma 参考与视觉实现规则，仅在 UI 工作时阅读。
- [`cloudflare-worker/README.md`](cloudflare-worker/README.md)：Worker secrets、KV 和授权管理细节。

## 代码入口

- `frontend-react/`：唯一前端源码；根目录旧原生前端已移除。
- `cloudflare-worker/`：产品授权、手动云同步、AI 和管理接口。
- `netlify/functions/worker-proxy.mjs`：Commercial 网络代理，公共路由来自 Worker 契约。
- `license-admin/`：独立的授权管理页。
- 根 `index.html`：只提供线上入口，不加载应用 bundle。
- `promo-video/`：保留为忽略路径；如以后重新创建，仍不属于主仓库维护范围。

## 本地开发与验证

前端统一使用 pnpm：

```bash
cd frontend-react
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm build:zhang
pnpm build:commercial
pnpm test:e2e
```

Worker 使用 npm：

```bash
cd cloudflare-worker
npm ci
npm run check
npx wrangler deploy --dry-run
```

不要混用前端与 Worker 的包管理器。构建产物、测试报告、工具缓存和 secret 不提交。

## 两个版本

- Zhang edition：默认构建，GitHub Pages 路径 `/seat-manager/`，使用本地密码。
- Commercial edition：`pnpm build:commercial`，Cloudflare Pages 根路径 `/`，使用产品授权码和设备名额。

两版共享业务实现，但登录方式和浏览器 origin 不同。不得改变 Zhang 本地密码、Commercial 产品授权、旧数据、备份或同步格式。

线上入口：

- Zhang：<https://charlie-hong-smu.github.io/seat-manager/>
- Commercial：<https://seat-manager-commercial.pages.dev/>
- 授权管理页：<https://seat-manager-license-admin.pages.dev/>
- Netlify 代理：<https://seat-manager-worker-proxy.netlify.app/>

## 发布

推送 `main` 后：

- `.github/workflows/pages.yml` 检查并发布 Zhang edition 到 GitHub Pages。
- `.github/workflows/cloudflare-commercial.yml` 根据变更目录发布 Commercial Pages、Worker 或授权管理页。
- Netlify 代理是独立发布面；修改代理或公共路由后按 `docs/OPERATIONS.md` 单独发布。

线上地址、授权记录、secret 和部署状态可能变化，执行线上操作前必须实时核验。
