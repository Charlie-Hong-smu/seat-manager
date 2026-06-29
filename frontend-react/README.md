# React Frontend

这是“小张专用座位管理器”的新版 React/Vite/Tailwind 前端目录。

当前阶段已接入旧版本地数据桥，可显示和保存真实学生、座位顺序、锁定座位、名单批量导入、学生详情编辑、奖罚记录、行为标签、成绩导入与考试保存写回、保存考试看板数据，以及 AI 评语草稿缓存、评语标准库、真实 Worker 生成调用、批量评语队列续跑/失败恢复和评语 CSV 导出。登录、修改密码、本地自动保存、座位表 CSV 导出、本机备份 JSON 导出/恢复、手动云端备份/恢复入口和安装到桌面入口已经按旧版键名兼容迁移。没有旧数据时会回退到 `src/app/components/mockData.ts` 的模拟数据。

核心模块已基本齐全。最近一轮改进（宿舍周期制重构、座位限制条件、评语工作台体验、学生详情标签页、商用化双版本等）的清单见仓库根目录 `README.md` 的「最近进展」与「版本与商用化」两节。

```bash
npm install
npm run dev
npm run build                          # 小张版（默认 edition）
VITE_EDITION=commercial npm run build  # 商用版（授权码登录）
```

版本由 `src/app/config.ts` 的 `VITE_EDITION` 决定：默认 = 小张版（本地密码、离线，行为不可改动）；`commercial` = 商用授权码版。详见根 `README.md`。

Vite 已配置 `base: "/seat-manager/"`，用于后续 GitHub Pages 部署。

旧版入口仍保留在仓库根目录的 `index.html`、`style.css`、`app.js`。

## Figma Make 协作约定

详细规则见仓库根目录 `DESIGN.md`。

- `frontend-react/` 是真实实现源。
- Figma Make 文件只作为设计参考，不直接覆盖本目录。
- 成绩页主要参考 `1QpH5tRbV2oVGkSKN8tDph`。
- 全局浅色 dashboard 风格参考 `T89q98PawNHmuhwiEPbBHY`。
- 修改 UI 时要保留现有真实数据、成绩导入保存、AI 评语、评语工作台、备份同步、登录和 PWA 逻辑。
