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
- `components/workspaces/`：Today、Daily（座位）、Data、History、Scores、ClassFund 的独立页面实现与稳定 barrel；Scores 由 App 按需加载。
- `state/teacherWorkbench.ts`：课表、作业、今日队列、周报事实和题目得分率的本地纯函数边界；这些计算不依赖 AI。
- `components/RetryableLazy.tsx`：非首屏模块统一骨架、错误边界和原地重试；重试不刷新页面或重建持久状态控制器。
- `components/studentModalSelectors.ts`：学生弹窗的日期周、成绩和别名纯派生逻辑。
- `components/commentBatchStorage.ts`：评语批量队列的兼容存储边界，键保持 `seat-manager-ai-comment-batch-state-v1`。
- `hooks/useStudentActions.ts`、`useDormitoryActions.ts`、`useClassFundActions.ts`：App 使用的三个领域 action 组；不得合并成万能 action hook。
- `components/DormitoryListPanel.tsx`、`DormitoryMembersPanel.tsx`：宿舍周期/列表与成员交互区；事件账本仍由工作区顶层协调。
- `state/aiAssistantPayload.ts`、`aiAssistantResult.ts`：AI 助手请求裁剪和上游结果清洗；`aiAssistantService.ts` 保持对外 facade。
- `state/aiApiClient.ts`：AI token、商用授权复用、代理/直连 fallback 和公共错误语义。
- `cloudflare-worker/`：授权、手动同步、AI 和授权管理接口。
- `cloudflare-worker/worker-routes.js`：浏览器可调用的公共路由契约；Netlify 代理直接复用。
- `license-admin/`：仅管理员使用的静态授权运营后台；`admin-model.js` 保持搜索、筛选和指标计算为可测试纯函数，页面不进入产品构建。

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

`workspaceValidation.ts` 是本机整柜、备份导入和云恢复的统一结构校验边界。它校验版本、切片/学期唯一 ID、当前切片引用以及每个切片的 `students` / `seatOrder` 基础形状，同时保留未知兼容字段。所有恢复必须先完整校验，再通过一次整柜写入替换本机数据；旧单班云数据也先包装成切片后执行同一条写入链路。

若 `seat-manager-workspaces-v1` 已存在但无法通过校验，启动流程不得初始化空柜或自动保存。产品登录后显示独立恢复界面，只允许导出原始字符串、导入通过校验的备份，或在二次确认后显式创建空柜。授权到期时间、AI 权益和设备额度继续只存在于管理员后台，不新增产品侧授权信息页。

授权记录存放在 `seat-manager:license:*` KV 键中。产品认证字段保持既有语义；管理员专用元数据包括 `acquisitionChannel`、`acquisitionDetail`、`createdAt` 和 `updatedAt`。缺少渠道的旧 `xhs-` 代号读取为小红书，其他旧记录读取为待补充；缺少创建时间时保持为空，不用更新时间倒推。所有设备绑定、解绑和清空操作必须通过统一的授权记录序列化边界，避免重写 KV 时丢失管理员元数据。

`POST /admin/licenses/list` 只接受管理员 Bearer token，并使用可选 `cursor` 分页返回授权记录；授权后台会逐页加载完整列表后在浏览器内计算看板和筛选。渠道和来源明细只存在于管理员接口，不进入产品登录响应或产品 token。

出勤、学生跟进任务、作业、课表、快捷记录预设、沟通草稿和抽签会话属于当前学期切片数据，随整柜备份和手动云同步一起保存。跟进任务允许 `studentId` 为空字符串，表示不绑定具体学生的班级事项；健康检查与班级动态不得把这种记录判为学生引用损坏。评语与 AI 辅助缓存使用当前工作区事实签名隔离，不能把旧事实的结果当作新结果自动写入。

“今日”是默认编排页，不是第二套业务存储。它从出勤、`FollowupTask` 和 `HomeworkAssignment` 派生需要处理的事项；完成、编辑和跳转仍回到来源领域。当前 `daily` 内部页面标识继续指向座位工作台，仅导航文案改为“座位”，避免破坏既有入口和测试语义。

作业台账只记录交付状态与简评，不记录分数或学生端提交。新作业为每位学生创建 `unrecorded`（待登记）状态；既有 `pending` 继续表示未交，读取时不得把旧作业迁移成待登记。老师先通过快速登记将学生设为已交、未交、补交或免交，备注和逐人下拉留在详细视图。作业可由老师显式创建带 `sourceRef.domain = homework` 的跟进任务，但作业状态和任务状态不自动互相覆盖。快捷记录继续写入 `StudentRecord`，可选 `score` 只用于记录与统计，不构成独立积分账户。

常用学科目录保存在当前切片 `settings.subjectCatalog`，默认包含语文、数学、英语、物理、化学、生物、历史、政治和地理，并合并课表、历史作业及成绩中已经使用的学科。修改目录名称不重写历史作业；目录继续随既有工作区备份和手动云同步保存，不新增全局存储键。

座位布局保存在当前学期切片的 `settings.seatLayout`，使用 `version: 1` 的拓扑结构：稳定座位 ID 与坐标、分组、相邻边、讲台方向。`seatOrder` 继续保持数组且其索引对应布局中同索引的稳定座位节点，避免改变旧备份、云同步和写入协议。没有 `seatLayout` 的旧数据仍按八列、相邻两列一组的既有规则读取；自定义布局使用精确座位容量，超出容量的学生留在候补区，不静默扩容。布局变更按稳定座位 ID 保留原座位，删除座位时再依序安置到空位，无法安置者进入候补区。

排座算法不得从数组索引推断自定义布局关系。邻座约束读取 `neighborEdges`，整组约束读取 `groups`，前排约束根据 `frontEdge` 与座位坐标派生；默认布局的输出和旧版八列语义保持不变。布局编辑只生成草稿，必须由老师点击“应用布局”后才写入当前学期数据。

宿舍统计周期配置保存在当前切片的 `settings.dormitoryPeriod`，字段固定为 `anchorDate`、`unit: week | month` 和 `intervalCount`。自然周、自然月和重复自定义周期从当前事件与旧版历史归档事件按真实发生日期派生净加减分；产品不再提供基础分、结转或手动结算。旧 `history` 继续兼容读取，其事件进入统一流水并可正常编辑、删除，但不再产生新的归档。

## AI 与网络链路

```text
UI service -> AiApiClient -> VITE_WORKER_URL(Netlify /api，可选)
                         -> direct workers.dev fallback
                         -> Worker -> DeepSeek
```

- Zhang 与 Commercial edition 都优先复用产品授权 token；一次授权同时控制软件登录、设备、云同步和 AI 权益。旧独立 AI 使用码只作为后端兼容路径保留，不再是两版前端的正常流程。
- AI service 负责业务 payload、缓存和返回类型；公共认证由 `AiApiClient` 负责。
- AI 只能生成建议。写入档案、评语素材或记录必须由老师点击确认。
- 周报与题目分析采用“本地先算、按需 AI 增强”：`teacherAiService.ts` 按事实签名缓存结果；`/generate-weekly-draft` 和 `/analyze-score-items` 不在页面打开时自动调用。题目分析只向 Worker 发送本地统计、知识点和稳定学生 ID，不发送整个工作簿。
- Worker 公共路由新增或删除时，必须同时通过 `cloudflare-worker/test/routes.test.js`。
- AI handler 在 payload 校验后、调用上游前统一经过 `AiRequestContext`/usage 边界：Cloudflare Rate Limiting 负责短窗口保护，KV 负责尽力而为的 UTC 日计数；KV 故障告警后放行。

## PWA

`vite-plugin-pwa` 为两种 base 生成 manifest 和 service worker。静态应用壳、哈希资源、图标和本地 XLSX 库进入 precache；API、Worker、同步和第三方请求不缓存。发现新 service worker 时只显示提示，用户点击“立即更新”后才刷新。

Scores、AI Assistant 和 Comment Workbench 是非首屏异步模块；登录、应用壳和默认今日页保持同步加载。构建预算固定为入口/单个异步 JS gzip 各 220 KiB，PWA precache 2.2 MiB，XLSX vendor 单独报告。

## 设计原则

- 保持一个持久状态源，临时弹窗、导航、动画和撤销栈留在组件状态。
- 保持内部纯函数与 I/O 边界分离，先测试数据转换，再调整组件。
- 不把 secret、DeepSeek key、产品码或管理员 token 放入前端或 Git。
- 不通过提交 `dist` 发布；两个前端都由 CI 重新构建。
