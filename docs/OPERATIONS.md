# 验证、发布与排障

## 本地验证

前端统一使用 pnpm：

```bash
cd frontend-react
pnpm install --frozen-lockfile
pnpm check
pnpm build:zhang
pnpm build:commercial
pnpm test:e2e
```

`check` 包含 ESLint、TypeScript strict 和 Vitest。Playwright 默认使用本机 Chrome，覆盖首次登录/状态持久化、manifest 和断网重开。

Worker 使用 npm：

```bash
cd cloudflare-worker
npm ci
npm run check
npx wrangler deploy --dry-run
```

## 自动发布

- `.github/workflows/pages.yml`：每次 `main` push 检查并构建 Zhang edition，发布 GitHub Pages。
- `.github/workflows/cloudflare-commercial.yml`：按变更目录检查并发布 Commercial Pages、Worker 或授权管理页。
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

1. 前端 `pnpm check` 与两个 edition build 通过。
2. Worker `npm run check` 和 Wrangler dry-run 通过。
3. 新接口同时存在于 Worker handler、`worker-routes.js`、代理和前端调用中。
4. 浏览器检查登录、当前 workspace、学生数量和关键本地数据没有变化。
5. PWA 检查 manifest base；Zhang 为 `/seat-manager/`，Commercial 为 `/`。

## 常见故障定位

- 本地正常、线上旧：先看 GitHub Actions/Cloudflare deployment 是否成功，再检查 service worker 更新提示，不先重写业务逻辑。
- Commercial 网络失败：检查构建中的 `VITE_WORKER_URL`、Netlify allowlist、代理响应编码头和 direct Worker。
- 新 AI 接口 Worker 正常但商用 404/405：先运行路由契约测试并重新发布 Netlify 代理。
- 浏览器显示 CORS 失败：查看 Worker 结构化日志；顶层异常应返回带 CORS 的 `{ "error": "internal_error" }`。
- 导入失败：先验证真实表头位置、列映射和 XLSX 浏览器库，不假设文件扩展名不支持。
- 云同步过大：当前整柜上限 5 MiB，不自动切片或合并；先导出本机 JSON，再评估独立迁移方案。

线上地址、secret 值、授权记录和部署状态都可能变化，应在执行线上操作前实时核验。
