# 小张专用座位管理器

这是座位管理、成绩分析和 AI 期末评语辅助工具。仓库目前同时保留旧版原生前端和新版 React 前端，迁移会按模块逐步完成。

## 入口

- 旧版本地入口：根目录 `index.html`
- 新版 React 入口：`frontend-react/`
- GitHub Pages 部署后：新版在站点根路径，旧版保留在 `/legacy/`

## 旧版运行

旧版不需要构建，直接打开根目录 `index.html` 即可。旧版仍使用：

- `index.html`
- `style.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `cloudflare-worker/`

## React 新版开发

```bash
cd frontend-react
npm install
npm run dev
```

## React 新版构建

```bash
cd frontend-react
npm run build
```

Vite 已设置：

```ts
base: "/seat-manager/"
```

## GitHub Pages 部署

`.github/workflows/pages.yml` 会：

1. 安装 React 前端依赖。
2. 构建 `frontend-react/dist`。
3. 将 React 构建结果作为新版站点根目录。
4. 将旧版 `index.html`、`style.css`、`app.js`、`manifest.webmanifest`、`sw.js`、`avatar.jpg` 复制到部署产物的 `legacy/`。

## Cloudflare Worker

`cloudflare-worker/` 保持独立，不会被 React 构建或 GitHub Pages workflow 修改。AI 调用密钥仍应只放在 Worker 或 Cloudflare 环境变量中，不要写入前端代码。

## 当前迁移状态

已迁移到 React：

- Figma 风格应用外壳、顶部栏、侧栏、座位页、成绩页、学生详情、AI 评语抽屉、评语工作台结构。
- 旧版本地数据读取桥。
- 学生列表、座位顺序、座位展示、学生数量和座位数量。
- 座位拖拽换座、随机排座、按名单顺序、撤销、锁定座位。
- 新增学生和基础学生详情入口。
- 保存考试数据到 React 成绩看板展示。
- AI 评语草稿和缓存读取/保存的基础桥接。
- 旧版兼容的登录、本地自动保存、手动云端备份/恢复入口。
- PWA 安装到桌面的入口和浏览器安装提示 fallback。

尚未完整迁移：

- 成绩导入和考试保存写回。
- AI 评语真实 Cloudflare Worker 调用。
- 批量评语真实队列的完整续跑/失败恢复。
- 修改密码、完整导入/导出、本机备份恢复等旧版周边工具。
