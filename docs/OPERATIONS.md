# 验证、发布与排障

## 本地验证

人工调试 UI 时，默认启动开发服务器：

```bash
cd frontend-react
pnpm dev --host 127.0.0.1
```

打开终端输出的 `/seat-manager/` 本地地址，在登录页点击“进入本地预览”。该入口只在 Vite 开发模式且 hostname 为 `127.0.0.1` 或 `localhost` 时可用，仅创建临时会话，不占用授权设备名额。

`vite preview` 用于验证生产构建、PWA 或发布包，会按生产环境保留产品授权登录，不作为日常 UI 调试入口。

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

授权后台保持无构建静态页面。其搜索、筛选、分页和看板计算测试已包含在 Worker 的 `npm run check` 中；本地视觉检查可从仓库根目录启动：

```bash
python3 -m http.server 4174 --directory license-admin
```

打开 `http://127.0.0.1:4174/`。真实管理员密钥只允许保存在本机浏览器，不写入仓库、测试数据或命令参数。

## 自动发布

- `.github/workflows/pages.yml`：前端变化时检查并自动发布 Zhang 先行版。
- `.github/workflows/cloudflare-commercial.yml`：只按目录变化自动发布共享 Worker 或授权管理页，不再自动发布 Commercial 前端。
- `.github/workflows/promote-commercial.yml`：用户明确说“上线商用版”后，由 Codex传入已在 Zhang 验证的完整 commit SHA；同一入口传入上一稳定 SHA 即为回滚。
- `frontend-react/dist` 不进入 Git；根 `index.html` 只是线上入口说明，不是应用 bundle。

Cloudflare workflow 需要 GitHub Secrets `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`；Commercial 前端可通过仓库变量 `COMMERCIAL_WORKER_URL` 指向 Netlify `/api`。Commercial 晋升必须遵守 `VERSION_GOVERNANCE.md`；普通 `main` push 不得改变 Commercial 前端，晋升记录以 workflow summary 中的完整 SHA 为准。

授权运营后台字段或管理员接口变化时，先部署并验证共享 Worker，再部署 `license-admin` Pages。该页面是独立管理员发布面，不触发 Commercial 前端晋升；线上验收默认只读，除非用户明确要求创建或修改真实授权。

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
   - 教师工作台 AI 路由固定为 `POST /generate-weekly-draft` 与 `POST /analyze-score-items`；两者复用产品授权和既有每日额度，不新增充值或计费配置。
5. 浏览器检查登录、当前 workspace、学生数量和关键本地数据没有变化。
   - 若本机工作区损坏，应进入只读恢复界面；确认自动保存未覆盖原始 `seat-manager-workspaces-v1`，并验证原始导出、有效备份恢复和显式空柜重置。
6. PWA 检查 manifest base；Zhang 为 `/seat-manager/`，Commercial 为 `/`。
7. Zhang 授权登录发送 `edition: zhang`；旧授权记录缺少 `allowedEditions` 时只能登录 Commercial。
8. 自定义座位布局需至少验证：未配置时仍为八列默认；非八列网格和三行分组可保存并在刷新后恢复；围桌邻座/整组约束可参与预排；座位不足时学生进入候补区且可重新落座；历史快照和 CSV 导出保留自定义座位语义。
9. 教师工作台需至少验证：今日页不自动调用 AI；课表和作业刷新后仍存在；新作业学生默认为待登记且旧未交状态不迁移；默认九科、自定义学科和快速/详细登记切换正常；全部已交有确认且可撤销；快捷记录可撤销；周报和个人沟通稿只有显式保存才进入历史；题目分析只识别每题一列的宽表；AI 候选必须由老师逐项确认后创建跟进。

## 常见故障定位

- 本地正常、线上旧：先看 GitHub Actions/Cloudflare deployment 是否成功，再检查 service worker 更新提示，不先重写业务逻辑。
- Commercial 网络失败：检查构建中的 `VITE_WORKER_URL`、Netlify allowlist、代理响应编码头和 direct Worker。
- 新 AI 接口 Worker 正常但商用 404/405：先运行路由契约测试并重新发布 Netlify 代理。
- 浏览器显示 CORS 失败：查看 Worker 结构化日志；顶层异常应返回带 CORS 的 `{ "error": "internal_error" }`。
- 导入失败：先验证真实表头位置、列映射和 XLSX 浏览器库，不假设文件扩展名不支持。
- 本机工作区损坏：先在恢复界面导出原始数据，禁止通过刷新、手动改 localStorage 或反复导入绕过校验；使用已知有效整柜备份恢复，或取得用户明确同意后新建空柜。
- 云同步过大：当前整柜上限 5 MiB，不自动切片或合并；先导出本机 JSON，再评估独立迁移方案。

线上地址、secret 值、授权记录和部署状态都可能变化，应在执行线上操作前实时核验。
