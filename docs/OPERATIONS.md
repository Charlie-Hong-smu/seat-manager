# 验证、发布与排障

## 本地验证

前端统一使用 pnpm：

```bash
cd frontend-react
pnpm install --frozen-lockfile
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
```

覆盖率门槛只约束持久状态、导入导出、业务 action 和 AI 数据转换等核心模块：语句/行/函数 70%，分支 60%。Playwright 分为 `test:e2e:zhang` 与 `test:e2e:commercial`；Commercial 的模拟授权只存在于测试浏览器上下文，不会进入生产源码或构建。

`check:design` 验证 `AGENTS.md` 的设计规范入口、`docs/DESIGN_SYSTEM.md`、共享 UI primitives 与核心 CSS tokens 同步存在。它用于防止重构后设计系统入口或基础组件静默丢失；视觉验收仍按设计规范清单和浏览器 smoke test 执行。

Worker 使用 npm：

```bash
cd cloudflare-worker
npm ci
npm run check
npx wrangler deploy --dry-run
```

## 自动发布

- `.github/workflows/pages.yml`：只有前端源码、资源、锁文件、测试或构建配置变化时运行，检查覆盖率与双 edition Chromium 后发布 Zhang edition。
- `.github/workflows/cloudflare-commercial.yml`：排除纯 Markdown 变化，再按实际目录发布 Commercial Pages、Worker 或授权管理页。
- `frontend-react/dist` 不进入 Git；根 `index.html` 只是线上入口说明，不是应用 bundle。

Cloudflare workflow 需要 GitHub Secrets `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`；Commercial 前端可通过仓库变量 `COMMERCIAL_WORKER_URL` 指向 Netlify `/api`。

## 手动操作

不要把 secret 放在命令参数或仓库文件中。设置 Worker secret：

```bash
cd cloudflare-worker
npx wrangler secret put SECRET_NAME
```

Netlify 代理目前是独立发布面。修改 `netlify/functions/worker-proxy.mjs` 或公共路由依赖后，在确认站点绑定无误时执行：

```bash
netlify deploy --prod
```

该操作会改变线上状态，agent 必须在用户已授权部署时执行。普通代码修改不能默认部署。

## 发布前验收

1. 前端 lint、strict typecheck、`test:coverage`、两个 edition build、`check:size` 和 `check:production` 通过。
2. `test:e2e:all` 同时通过；Commercial 测试不得访问生产授权记录。
3. Worker `npm run check` 和 Wrangler dry-run 通过。
4. 新接口同时存在于 Worker handler、`worker-routes.js`、代理和前端调用中。
5. 浏览器检查登录、当前 workspace、学生数量和关键本地数据没有变化。
6. PWA 检查 manifest base；Zhang 为 `/seat-manager/`，Commercial 为 `/`。

## 常见故障定位

- 本地正常、线上旧：先看 GitHub Actions/Cloudflare deployment 是否成功，再检查 service worker 更新提示，不先重写业务逻辑。
- Commercial 网络失败：检查构建中的 `VITE_WORKER_URL`、Netlify allowlist、代理响应编码头和 direct Worker。
- 新 AI 接口 Worker 正常但商用 404/405：先运行路由契约测试并重新发布 Netlify 代理。
- 浏览器显示 CORS 失败：查看 Worker 结构化日志；顶层异常应返回带 CORS 的 `{ "error": "internal_error" }`。
- 导入失败：先验证真实表头位置、列映射和 XLSX 浏览器库，不假设文件扩展名不支持。
- 云同步过大：当前整柜上限 5 MiB，不自动切片或合并；先导出本机 JSON，再评估独立迁移方案。

线上地址、secret 值、授权记录和部署状态都可能变化，应在执行线上操作前实时核验。
