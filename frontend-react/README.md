# React 前端

这是座位管理系统唯一的前端实现，使用 React、TypeScript、Vite、Tailwind 和 pnpm。开始修改前先读仓库根目录 `AGENTS.md` 与 `docs/ARCHITECTURE.md`。

## 开发和验证

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint && pnpm typecheck && pnpm test:coverage
pnpm build:zhang
pnpm check:size
pnpm build:commercial
pnpm check:size && pnpm check:production
pnpm test:e2e:all
```

- `test:coverage`：核心持久状态、业务 action 和 AI 转换覆盖率门槛。
- `build:zhang`：默认小张版，base `/seat-manager/`。
- `build:commercial`：商用授权版，base `/`。
- `test:e2e:all`：Zhang 本地密码/PWA 与 Commercial 产品授权两套 Chromium 测试；Commercial mock 只存在于 `e2e/`。
- `check:size` / `check:production`：构建预算与生产包测试标记扫描。

不要使用 npm 修改本目录依赖；锁文件是 `pnpm-lock.yaml`。不要提交 `dist`、测试报告或浏览器产物。

## 结构

- `src/app/App.tsx`：应用壳与跨页面协调。
- `src/app/state/seatManagerController.ts`：唯一持久状态控制器。
- `src/app/state/`：数据转换、存储、导入导出和 API service。
- 出勤、跟进任务、抽签会话、统一时间线和数据健康检查均属于当前 workspace 的本地业务能力，不新增后台自动同步。
- `src/app/state/aiApiClient.ts`：共享 AI 认证与网络 fallback。
- `src/app/components/workspaces/`：独立工作区页面与稳定入口；Scores 按需加载。
- `src/app/components/`：页面、抽屉、弹窗和共享 UI。
- `public/`：PWA 图标、Headers 和本地 XLSX 库。

完整数据流、兼容键、双 edition、Worker 和 PWA 说明见 `../docs/ARCHITECTURE.md`。

## 不可破坏项

- 不改变 Zhang 本地密码与 Commercial 产品授权两套登录行为。
- 不改变已有 workspace、旧数据、备份和云同步格式。
- 不让 AI 未经教师确认写入业务数据。
- 不把 Figma Make 导出直接覆盖真实组件；视觉规则见 `../DESIGN.md`。
