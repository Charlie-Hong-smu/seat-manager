# 系统架构

本文描述长期稳定的模块边界、数据流和兼容约束。执行规则先读根目录 `AGENTS.md`，部署与排障见 `OPERATIONS.md`。

## 产品与运行面

同一套 React 源码构建两个版本：

- Zhang edition：GitHub Pages `/seat-manager/`，本地密码，离线使用。
- Commercial edition：Cloudflare Pages 根路径，产品授权码、设备名额和 AI 权益。

两个站点的浏览器存储按 origin 隔离。`VITE_EDITION` 只在构建时选择登录与产品文案，不应产生两套业务实现。

## 代码边界

- `frontend-react/src/app/App.tsx`：应用壳、页面切换和跨业务协调。
- `state/seatManagerController.ts`：唯一持久业务状态控制器；学生、座位、成绩、宿舍、班费和历史都来自同一个 `SeatManagerState`。
- `components/workspaces/`：App 使用的稳定页面入口。
- `state/aiApiClient.ts`：AI token、商用授权复用、代理/直连 fallback 和公共错误语义。
- `cloudflare-worker/`：授权、手动同步、AI 和授权管理接口。
- `cloudflare-worker/worker-routes.js`：浏览器可调用的公共路由契约；Netlify 代理直接复用。
- `license-admin/`：仅管理员使用的静态授权管理页。

`WorkspacePages.tsx`、`CommentWorkbench.tsx`、`StudentModal.tsx` 和 `DormitoryWorkspace.tsx` 仍是较大的功能实现文件。新增工作应优先在稳定边界内提取局部组件或纯函数，不得为了缩短文件一次性改写业务流程。

## 持久数据流

```text
React event
  -> SeatManagerController 更新唯一 SeatManagerState
  -> legacyWriteAdapter 将规范状态转换为兼容存储形状
  -> storage.ts 写入当前 WorkspaceSlice.data
  -> workspaces.ts 写入 seat-manager-workspaces-v1
```

兼容键与格式：

- `seat-manager-workspaces-v1`：当前多班级、多学期文件柜，`version: 1`。
- `homeroom-seat-manager-v1`：首次迁移用的旧单班数据入口，不得删除读取兼容。
- WorkspaceSlice `data`：保持旧完整 state 形状，供导入、导出和旧客户端兼容。
- 本机备份：`{ version, exportedAt, data }`。
- 云同步：同时发送 `workspaceBook` 和旧兼容字段 `data`，上限 5 MiB。

云同步是显式上传/恢复，不做后台同步、冲突合并或增量覆盖。恢复前先生成本机备份。

## AI 与网络链路

```text
UI service -> AiApiClient -> VITE_WORKER_URL(Netlify /api，可选)
                         -> direct workers.dev fallback
                         -> Worker -> DeepSeek
```

- Zhang edition 使用独立 AI 使用码；Commercial edition 优先复用产品授权 token。
- AI service 负责业务 payload、缓存和返回类型；公共认证由 `AiApiClient` 负责。
- AI 只能生成建议。写入档案、评语素材或记录必须由老师点击确认。
- Worker 公共路由新增或删除时，必须同时通过 `cloudflare-worker/test/routes.test.js`。

## PWA

`vite-plugin-pwa` 为两种 base 生成 manifest 和 service worker。静态应用壳、哈希资源、图标和本地 XLSX 库进入 precache；API、Worker、同步和第三方请求不缓存。发现新 service worker 时只显示提示，用户点击“立即更新”后才刷新。

## 设计原则

- 保持一个持久状态源，临时弹窗、导航、动画和撤销栈留在组件状态。
- 保持内部纯函数与 I/O 边界分离，先测试数据转换，再调整组件。
- 不把 secret、DeepSeek key、产品码或管理员 token 放入前端或 Git。
- 不通过提交 `dist` 发布；两个前端都由 CI 重新构建。
