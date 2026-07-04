# 小张专用座位管理器

这是座位管理、成绩分析和 AI 期末评语辅助工具。新版 React 前端已经成为主应用，旧版原生前端已从工作区移除，不再随 GitHub Pages 发布。

## 入口

- 主应用源码：`frontend-react/`
- GitHub Pages 部署后：React 新版在站点根路径。
- 根目录 `index.html`：仅用于 GitHub Pages 分支发布兜底，加载 `frontend-react/dist` 的 React 构建产物，不是旧版应用。
- 旧版原生前端：旧版大文件已移到垃圾箱；需要时也可从 Git 历史找回。

## 旧版移除

旧版原生前端已停止作为发布入口，并已从仓库工作区移除：

- `style.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `avatar.jpg`
- `vendor/`

根目录新保留的 `index.html` 是一个很小的 React 启动页，用于防止 GitHub Pages 仍按分支根目录发布时渲染 README。旧版文件删除时先移入 macOS 垃圾箱，不是永久删除；提交后也仍可从 Git 历史恢复。`cloudflare-worker/` 是独立后端，不属于旧版前端。

## React 新版开发

```bash
cd frontend-react
npm install
npm run dev
```

## Figma 设计协作

长期设计协作规则写在 `DESIGN.md`。新开对话时，请先让 Codex 读取 `README.md`、`frontend-react/README.md` 和 `DESIGN.md`。

当前约定：

- `frontend-react/` 是新版真实代码源。
- Figma Make 是设计参考，不直接覆盖项目。
- 成绩页优先参考 Figma Make 文件 `1QpH5tRbV2oVGkSKN8tDph`。
- 整体应用风格参考 Figma Make 文件 `T89q98PawNHmuhwiEPbBHY`。
- 实现时必须保留座位、成绩、AI 评语、评语工作台、备份同步、登录和 PWA 等现有逻辑。

## React 新版构建

```bash
cd frontend-react
npm run build                      # 小张版（默认 edition）
VITE_EDITION=commercial npm run build   # 商用版
```

Vite 已设置：

```ts
base: "/seat-manager/"
```

## 版本（Editions）与商用化

新版是「一套代码、两种构建」，由打包时的环境变量 `VITE_EDITION` 决定（见 `frontend-react/src/app/config.ts`）：

- **小张版（`VITE_EDITION=zhang`，默认不设也等同于 `zhang`）**：本地密码登录、首次设密码、「修改密码」、纯离线可用。行为与历史版本完全一致，**不要改动其默认行为**。
- **商用版（`VITE_EDITION=commercial`）**：改为「产品授权码」登录（服务端校验），用于对外售卖。`VITE_APP_NAME` 可覆盖显示名（默认「班级座位管理器」）。

发布方式：两种构建产物放在**两个网址**。小张版继续用现有 GitHub Pages；商用版另起一个部署（计划用 Cloudflare Pages，构建时设 `VITE_EDITION=commercial`）。两站数据各自隔离在各自浏览器/网址下。

当前商用试用站已建在 Cloudflare Pages：

- 稳定地址：`https://seat-manager-commercial.pages.dev/`
- 项目名：`seat-manager-commercial`
- 构建方式：`VITE_EDITION=commercial VITE_BASE=/ npm run build`
- 部署方式：从 `frontend-react/dist` 用 Wrangler Pages 部署。

授权/计费（后端在 `cloudflare-worker/`，详见其 README）：

- **买断**：在 KV 建一条 license 记录，`expiresAt` 留空 = 永久；`status` 改 `disabled` 可停用。
- **AI 权益**：商用版可复用同一个产品授权码开通 AI；在 license 记录中用 `aiEnabled`、`aiExpiresAt`、`aiDailyLimit` 单独控制，后续可单独续费或停用 AI。
- **设备名额**：每个授权码默认最多 3 台设备；商用版账号菜单提供“解绑本机”，可释放当前浏览器占用的设备名额。
- 早期收款走人工：收到款后在 Cloudflare KV 手动建/改记录，不接支付系统。

轻量授权管理页在 `license-admin/index.html`，线上地址为 `https://seat-manager-license-admin.pages.dev/`。它用于你自己管理老师授权码、软件到期日、AI 到期日、设备数和清空设备绑定；管理员密钥需要单独设置到 Worker Secret，不写入仓库。

`authStorage.ts` 同时保留本地密码与产品授权两套逻辑，`isAuthenticated()/clearAuth()` 按 edition 自动选择，互不干扰。

## GitHub Pages 部署

`.github/workflows/pages.yml` 会：

1. 安装 React 前端依赖。
2. 构建 `frontend-react/dist`。
3. 将 React 构建结果作为站点根目录。

旧版原生前端不再复制到 `/legacy/`。

## Cloudflare 商用版自动部署

`.github/workflows/cloudflare-commercial.yml` 用于在 `main` 推送后自动同步商用相关部署：

- `frontend-react/**` 变化：构建 `VITE_EDITION=commercial VITE_BASE=/`，部署到 Cloudflare Pages 项目 `seat-manager-commercial`。
- `cloudflare-worker/**` 变化：部署 Worker `seat-manager-ai`。
- `license-admin/**` 变化：部署授权管理页到 Cloudflare Pages 项目 `seat-manager-license-admin`。
- 手动运行该 workflow 时，三者都会部署。

启用前需要在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中添加：

```text
CLOUDFLARE_ACCOUNT_ID=432f0f0483c3f9cc87179a96ecd00102
CLOUDFLARE_API_TOKEN=<Cloudflare API Token>
```

`CLOUDFLARE_API_TOKEN` 需要能编辑 Workers、Workers KV 和 Pages。不要把 token 写入仓库文件。

如果启用了 Netlify API 中转，可在 GitHub 仓库 `Settings -> Secrets and variables -> Actions -> Variables` 添加：

```text
COMMERCIAL_WORKER_URL=https://你的-netlify-站点.netlify.app/api
```

该变量只影响商用版 Cloudflare Pages 构建；未设置时仍默认直连 `https://seat-manager-ai.hongchenglin03.workers.dev`。

## Netlify API 中转试验

`netlify/functions/worker-proxy.mjs` 是一个轻量代理，用于在用户无法直连 `workers.dev` 时，把浏览器请求改为：

```text
商用前端 -> Netlify /api/* -> Cloudflare Worker -> KV / DeepSeek
```

代理默认转发到 `https://seat-manager-ai.hongchenglin03.workers.dev`，也可在 Netlify 环境变量中设置：

```text
WORKER_ORIGIN=https://seat-manager-ai.hongchenglin03.workers.dev
```

Netlify 站点建议使用仓库根目录部署，配置已写入 `netlify.toml`。它只发布一个占位静态页和 `/api/:path*` 函数，不替代主应用。代理只放行应用需要的 `/license/*`、`/sync/*`、`/auth`、`/generate-comment`、`/analyze-class`、`/analyze-trend`、`/suggest-score-mapping` 路径，暂不代理 `/admin/*` 管理接口。

## Cloudflare Worker

`cloudflare-worker/` 保持独立，不会被 React 构建或 GitHub Pages workflow 修改。AI 调用密钥仍应只放在 Worker 或 Cloudflare 环境变量中，不要写入前端代码。

## 当前迁移状态

已迁移到 React：

- Figma 风格应用外壳、顶部栏、侧栏、座位页、成绩页、学生详情、AI 评语抽屉、评语工作台结构。
- 旧版本地数据读取桥。
- 学生列表、座位顺序、座位展示、学生数量和座位数量。
- 座位拖拽换座、随机排座、按名单顺序、撤销、锁定座位。
- 新增学生和学生详情精细编辑：姓名、性别、别名、行为标签、奖罚记录新增/删除/同步和删除学生。
- 成绩文件导入、考试保存写回、保存考试数据到 React 成绩看板展示。
- AI 评语草稿、缓存读取/保存和真实 Worker 生成调用。
- 批量评语生成队列、暂停/继续、失败记录、失败重试和评语 CSV 导出。
- 评语标准库管理、标准项选择、自定义素材和同步标签写回。
- 旧版兼容的登录、本地自动保存、手动云端备份/恢复入口。
- 修改密码。
- 座位表 CSV 导出、本机备份 JSON 导出与恢复。
- 名单批量导入，支持覆盖/追加和覆盖时保留历史数据。
- PWA 安装到桌面的入口和浏览器安装提示 fallback。

## 最近进展（2026-06，Claude 这边）

- **宿舍模块重构**：周期制计分（结算/一键周清/可选结转 + 周期历史归档）；事件可增/改/删；处罚措施字段 + 「已执行」勾选；抽出共享 `DormEventForm`（宿舍页与学生详情共用）；「同时记入责任人个人档案」显式开关。
- **座位限制条件**：恢复旧版排座约束的编辑界面（男女同桌、互补规则、必须前排、固定/不能同桌），放在可搜索学生的 `SeatSettingsModal`；顶部 4 个按钮合并为单一「排座」入口；修复座位卡锁图标点击错位、详细模式姓名截断。
- **成绩页**：历史考试支持行内改名称/日期。
- **评语工作台**：勾选学生时进度条不再突兀弹出（平滑提示），批量按钮文案稳定，背景统一。
- **学生详情**：拆成「奖罚记录 / 档案 / 成绩」标签页，降低信息密度。
- **应用外壳**：移除与侧栏重复的 `MainTabs` 顶栏。
- **商用化地基**：edition 双版本 + 产品授权码登录（详见上方「版本与商用化」）。

待办 / 已知问题（给 Codex 和后续）：

- AI 已可并入产品授权码；正式订阅计费和自动续费流程尚未实现。
- 商用版安全注意：核心离线应用是纯前端，授权码只能真正约束云同步与 AI；考虑给商用版加可选本地 PIN（隐私锁）。
- `/license/auth` 尚无限流（防授权码暴力猜测）。
- 旧版（根目录原生前端）已停止发布并从工作区移除；如需回退，可从垃圾箱或 Git 历史恢复。
