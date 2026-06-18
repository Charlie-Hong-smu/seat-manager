# React Frontend

这是“小张专用座位管理器”的新版 React/Vite/Tailwind 前端目录。

当前阶段已接入旧版本地数据读取桥，可显示真实学生、座位、保存考试和 AI 评语草稿缓存。没有旧数据时会回退到 `src/app/components/mockData.ts` 的模拟数据。

```bash
npm install
npm run dev
npm run build
```

Vite 已配置 `base: "/seat-manager/"`，用于后续 GitHub Pages 部署。

旧版入口仍保留在仓库根目录的 `index.html`、`style.css`、`app.js`。
