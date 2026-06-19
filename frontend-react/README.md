# React Frontend

这是“小张专用座位管理器”的新版 React/Vite/Tailwind 前端目录。

当前阶段已接入旧版本地数据桥，可显示和保存真实学生、座位顺序、锁定座位、成绩导入与考试保存写回、保存考试看板数据，以及 AI 评语草稿缓存和真实 Worker 生成调用。登录、修改密码、本地自动保存、座位表 CSV 导出、本机备份 JSON 导出/恢复、手动云端备份/恢复入口和安装到桌面入口已经按旧版键名兼容迁移。没有旧数据时会回退到 `src/app/components/mockData.ts` 的模拟数据。

仍在逐步迁移中的功能包括：批量评语队列续跑/失败恢复、名单批量导入和学生详情精细编辑。

```bash
npm install
npm run dev
npm run build
```

Vite 已配置 `base: "/seat-manager/"`，用于后续 GitHub Pages 部署。

旧版入口仍保留在仓库根目录的 `index.html`、`style.css`、`app.js`。
