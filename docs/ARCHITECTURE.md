# 系统架构

本文描述长期稳定的模块边界、数据流和兼容约束。执行规则先读根目录 `AGENTS.md`，部署与排障见 `OPERATIONS.md`。

## 产品与运行面

同一套 React 源码构建两个版本：

- Zhang edition：GitHub Pages `/seat-manager/`，产品授权码登录，作为个人与先行验证通道；已登录后保留离线应用能力。
- Commercial edition：Cloudflare Pages 根路径，产品授权码、设备名额和 AI 权益。

两个站点的浏览器存储按 origin 隔离。`VITE_EDITION` 只选择品牌、base、发布通道和集中声明的能力；`AUTH_MODE` 独立表示登录方式，当前两版均为 `license`。版本治理与自然语言发布规则见 `VERSION_GOVERNANCE.md`。

## 代码边界

- `frontend-react/src/app/App.tsx`：应用壳、页面切换和跨业务协调。
- `state/seatManagerController.ts`：唯一持久业务状态控制器；学生、座位、成绩、宿舍、班费和历史都来自同一个 `SeatManagerState`。
- `components/workspaces/`：Daily、Data、History、Scores、ClassFund 的独立页面实现与稳定 barrel；Scores 由 App 按需加载。
- `components/RetryableLazy.tsx`：非首屏模块统一骨架、错误边界和原地重试；重试不刷新页面或重建持久状态控制器。
- `components/studentModalSelectors.ts`：学生弹窗的日期周、成绩和别名纯派生逻辑。
- `components/commentBatchStorage.ts`：评语批量队列的兼容存储边界，键保持 `seat-manager-ai-comment-batch-state-v1`。
- `hooks/useStudentActions.ts`、`useDormitoryActions.ts`、`useClassFundActions.ts`：App 使用的三个领域 action 组；不得合并成万能 action hook。
- `components/DormitoryListPanel.tsx`、`DormitoryMembersPanel.tsx`：宿舍周期/列表与成员交互区；事件账本仍由工作区顶层协调。
- `state/aiAssistantPayload.ts`、`aiAssistantResult.ts`：AI 助手请求裁剪和上游结果清洗；`aiAssistantService.ts` 保持对外 facade。
- `state/aiApiClient.ts`：AI token、商用授权复用、代理/直连 fallback 和公共错误语义。
- `cloudflare-worker/`：授权、手动同步、AI 和授权管理接口。
- `cloudflare-worker/worker-routes.js`：浏览器可调用的公共路由契约；Netlify 代理直接复用。
- `license-admin/`：仅管理员使用的静态授权管理页。

`DormitoryWorkspace.tsx` 继续协调事件编辑，`CommentWorkbench.tsx` 和 `StudentModal.tsx` 仍包含较多紧密相连的交互状态。新增工作应从现有 action/selector/storage 边界继续局部提取，不得为了缩短文件一次性改写业务流程，也不得创建无业务意义的一行转发组件。

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
- 本机整柜备份：v2 `{ version, exportedAt, workspaceBook }`；继续兼容导入 v1 单班 `{ version, data }`。
- 云同步：同时发送 `workspaceBook` 和旧兼容字段 `data`，上限 5 MiB。

云同步是显式上传/恢复，不做后台同步、冲突合并或增量覆盖。恢复前先生成本机备份。

出勤、学生跟进任务和抽签会话属于当前学期切片数据，随整柜备份和手动云同步一起保存。评语与 AI 辅助缓存使用 `workspaceSliceId + studentId` 作为作用域，不能跨班级或学期复用。

## AI 与网络链路

```text
UI service -> AiApiClient -> VITE_WORKER_URL(Netlify /api，可选)
                         -> direct workers.dev fallback
                         -> Worker -> DeepSeek
```

- Zhang 与 Commercial edition 都优先复用产品授权 token；一次授权同时控制软件登录、设备、云同步和 AI 权益。旧独立 AI 使用码只作为后端兼容路径保留，不再是两版前端的正常流程。
- AI service 负责业务 payload、缓存和返回类型；公共认证由 `AiApiClient` 负责。
- AI 只能生成建议。写入档案、评语素材或记录必须由老师点击确认。
- Worker 公共路由新增或删除时，必须同时通过 `cloudflare-worker/test/routes.test.js`。
- AI handler 在 payload 校验后、调用上游前统一经过 `AiRequestContext`/usage 边界：Cloudflare Rate Limiting 负责短窗口保护，KV 负责尽力而为的 UTC 日计数；KV 故障告警后放行。

## PWA

`vite-plugin-pwa` 为两种 base 生成 manifest 和 service worker。静态应用壳、哈希资源、图标和本地 XLSX 库进入 precache；API、Worker、同步和第三方请求不缓存。发现新 service worker 时只显示提示，用户点击“立即更新”后才刷新。

Scores、AI Assistant 和 Comment Workbench 是非首屏异步模块；登录、应用壳和默认座位页保持同步加载。构建预算固定为入口/单个异步 JS gzip 各 220 KiB，PWA precache 2.2 MiB，XLSX vendor 单独报告。

## 设计原则

- 保持一个持久状态源，临时弹窗、导航、动画和撤销栈留在组件状态。
- 保持内部纯函数与 I/O 边界分离，先测试数据转换，再调整组件。
- 不把 secret、DeepSeek key、产品码或管理员 token 放入前端或 Git。
- 不通过提交 `dist` 发布；两个前端都由 CI 重新构建。
