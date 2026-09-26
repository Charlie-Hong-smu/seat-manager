# 系统架构

本文描述长期稳定的模块边界、数据流和兼容约束。执行规则先读根目录 `AGENTS.md`，部署与排障见 `OPERATIONS.md`。

## 产品与运行面

同一套 React 源码构建两个版本：

- Zhang edition：GitHub Pages `/seat-manager/`，产品授权码登录，作为个人与先行验证通道；已登录后保留离线应用能力。
- Commercial edition：Cloudflare Pages 根路径，产品授权码、设备名额和 AI 权益。

两个站点的浏览器存储按 origin 隔离。`VITE_EDITION` 只选择品牌、base、发布通道和集中声明的能力；`AUTH_MODE` 独立表示登录方式，当前两版均为 `license`。版本治理与自然语言发布规则见 `VERSION_GOVERNANCE.md`。

产品登录勾选“在此浏览器保持登录 90 天”后，`/license/auth` 签发最长 90 天的凭证，前端按服务端返回的 `expiresAt` 写入原有 localStorage 键；未勾选仍为 sessionStorage 中的 12 小时会话。AI 和手动云同步复用该产品凭证，AI 客户端读取其真实到期时间。旧 30 天凭证保持原有效期，更新前后端后需重新登录并勾选才能取得 90 天凭证；不在本地擅自延长签名凭证。关闭并重开同一浏览器、同一 origin 可恢复记住的登录；主动退出、解绑、清除站点数据或换浏览器/origin 需要重新授权。本地开发“进入本地预览”继续只创建 12 小时临时会话，旧独立 AI/同步授权仍保持各自 30 天兼容合同。

## 代码边界

- `frontend-react/src/app/App.tsx`：应用壳、页面切换和跨业务协调。
- `state/seatManagerController.ts`：唯一持久业务状态控制器；学生、座位、成绩、宿舍、班费和历史都来自同一个 `SeatManagerState`。
- `components/workspaces/`：各工作区页面实现与稳定 barrel；Scores、Data、History、ClassFund，以及 `components/DormitoryWorkspace.tsx` 由 App 直接按需加载，复用 `RetryableLazy` 的缓存与加载状态。
- `state/teacherWorkbench.ts`：课表、作业、今日队列、周报事实和题目得分率的本地纯函数边界；这些计算不依赖 AI。
- `state/studentSearch.ts`：学生姓名与别名的统一搜索归一化边界；顶栏、成绩、评语、座位、出勤、作业、宿舍和班费选择器复用同一规则。
- `state/dormitoryPreferences.ts`：宿舍事件类型和默认分数的切片设置规范化与旧全局键只读迁移边界。
- `state/classManagementCommands.ts`：跟进完成与结果、出勤状态清理、学生归档/恢复/彻底删除等跨领域命令；页面不得各自拼接同类级联修改。
- `state/activityEvents.ts`：`BusinessEntityRef` 与本地不可变动作流水的规范化边界；新动作从升级后开始记录，不反推旧状态历史。
- `components/FollowupTaskForm.tsx`、`LinkedWorkflow.tsx`、`StudentAttentionSummary.tsx`：跟进表单、来源/关联任务/处理结果和学生关注摘要的共享业务组件。
- `components/RetryableLazy.tsx`：非首屏模块统一骨架、错误边界和原地重试；重试不刷新页面或重建持久状态控制器。
- `components/studentModalSelectors.ts`：学生弹窗的日期周、成绩和别名纯派生逻辑。
- `components/commentBatchStorage.ts`：评语批量队列的兼容存储边界，键保持 `seat-manager-ai-comment-batch-state-v1`。
- `hooks/useStudentActions.ts`、`useDormitoryActions.ts`、`useClassFundActions.ts`：App 使用的三个领域 action 组；不得合并成万能 action hook。
- `components/DormitoryListPanel.tsx`、`DormitoryMembersPanel.tsx`：宿舍周期/列表与成员交互区；事件账本仍由工作区顶层协调。
- `state/aiAssistantPayload.ts`、`aiAssistantResult.ts`：AI 助手请求裁剪和上游结果清洗；`aiAssistantService.ts` 保持对外 facade。
- `components/AiAssistantLauncher.tsx`、`AiAssistantWorkspace.tsx`：全局 AI Companion 的轻量常驻入口与按需加载面板；同一组件状态跨业务页保留对话与草稿，并按工作区 ID 复用既有 `seat-manager-ai-assistant-chat:*` 缓存。
- `state/aiApiClient.ts`：AI token、商用授权复用、代理/直连 fallback 和公共错误语义。
- `cloudflare-worker/`：授权、手动同步、AI 和授权管理接口。
- `cloudflare-worker/worker-routes.js`：浏览器可调用的公共路由契约；Netlify 代理直接复用。
- `license-admin/`：仅管理员使用的静态授权运营后台；`admin-model.js` 保持搜索、筛选和指标计算为可测试纯函数，页面不进入产品构建。

BoardUI 预览的评语工作台由 `App` 主导航在原右侧工作面内挂载，和其他工作区共用 `MotionSwitch` 的可中断纵向交接；只保留一个真实业务实例，过渡副本禁止交互。`RetryableLazy` 的加载标记让导航保留旧画面直到目的页就绪；评语导出与学生详情继续走顶层模态层，避免被主区域的裁切与容器宽度限制。

`DormitoryWorkspace.tsx` 继续协调事件编辑，`CommentWorkbench.tsx` 和 `StudentModal.tsx` 仍包含较多紧密相连的交互状态。新增工作应从现有 action/selector/storage 边界继续局部提取，不得为了缩短文件一次性改写业务流程，也不得创建无业务意义的一行转发组件。

## 持久数据流

跟进任务用 `studentIds` 保存完整关联名单，`studentId` 保留为旧格式兼容首项；显式空名单表示班级事项。`followupStudents.ts` 统一名单读取、参与者匹配和删除学生时的解除关联。手动共同事项与宿舍共同处理共用一条任务及处理状态；作业、出勤、成绩、个人 AI 建议和班费逐人催缴使用独立任务，`studentMode: individual` 保留催缴等来源为 manual 的逐人语义。`dailyManagement.ts` 的 `prepareFollowupTasks` / `editFollowupTask` 统一所有创建与编辑入口。复用来源任务需匹配完整参与名单、来源实体与子实体，不按标题合并，也不能只命中第一名学生。今日、周报、档案与历史按同一名单读取；任务完成只生成一次包含全部参与者的动作，逐人批量创建则每条任务各记一项动作。备份和手动同步沿用现有存储链路与键，读取旧任务时不合并历史记录。

同一作业来源、标题、类型、说明及截止日一致的逐人跟进，在待办与今日按一件事展示；卡片内仍逐人完成、取消、编辑和选择是否同步交付状态。分组仅在读取时计算，存储、来源关联、动作流水及撤销仍按每个学生的任务独立保留；不同作业、后续任务或非逐人的人工同名任务不合并。搜索或状态筛选命中任一成员时展示整组，便于看清其余人的处理进度。

逐人班费、出勤和成绩任务也按同一来源实体及一致的标题、类型、说明和截止日展示为一组；显式逐人的无来源任务额外匹配计划日期。继续跟进和 AI 个别建议不归组。组卡提供逐人处理和对待处理成员的批量完成/取消；批量完成作业时只询问一次是否同步交付状态，撤销仍逐人恢复任务和作业格子。组内记录保持独立，筛选命中一人时显示整组。

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

出勤、学生跟进任务、作业、课表、快捷记录预设、沟通草稿、动作流水和抽签会话属于当前学期切片数据，随整柜备份和手动云同步一起保存。跟进任务允许 `studentId` 为空字符串，表示不绑定具体学生的班级事项；健康检查与班级动态不得把这种记录判为学生引用损坏。评语与 AI 辅助缓存使用当前工作区事实签名隔离，不能把旧事实的结果当作新结果自动写入。

跨领域定位统一使用 `BusinessEntityRef { domain, entityId, subEntityId?, studentId?, date? }`。`subEntityId` 用于成绩题目/知识点等子对象，避免同一考试的不同问题被错误去重；旧 `{ domain, entityId }` 始终可读。所有来源跳转经 `navigateToEntity(ref)` 打开正确工作区、页签、日期和学生，并滚动高亮；来源已删除时保留历史说明但不伪造可用链接。

`activityEvents` 只保存动作时间、引用、全部关联学生、标题和简短结果，不保存状态快照。新建、编辑、状态变化、归档、恢复、分享和删除写入动作流水；短时撤销仍由页面持有旧值，并且必须同时移除本次动作事件。缺失流水的旧数据继续以“旧数据汇总”展示，不把最终状态伪装成过去发生的动作。

跟进任务采用“快速完成 + 可选处理结果”：完成本身不要求填写文字；随后可补结果或基于原来源继续跟进，后续任务以 `continuedFromTaskId` 形成链。作业等来源可同步时必须再次询问老师，拒绝同步不影响任务完成。

`plannedDate` 表示计划开始处理，`dueDate` 表示截止；未安排的任务保留空日期，不自动填今天。今日只收录已经到计划日期或到期的任务。出勤请假从单日记录继承为可跨日时段，老师可登记预计结束并在返校时确认；旧时段只覆盖原区间，新登记的追踪请假在确认返校前继续显示为请假。指定日期的显式出勤记录优先于继承状态，导出和今日队列读取同一日期计算。沟通稿的编辑缓存与正式保存分开，正式稿可从历史重开，并记录草稿/已沟通状态、渠道和时间。

收费事项保存在当前学期 `settings.fundCollections`，记录逐人应交额、截止日及调整理由；每笔真实收款或退款仍保存在既有班费流水，以 `collectionId` 和单个学生 ID 归属。旧流水不自动分摊，老师可手动关联金额合适的既有收入；余额从未作废的已关联流水计算。按未交齐名单创建的催缴任务继续逐人保存。新学期清空收费事项目录，旧学期与备份保留原数据；不增加新的存储键或网络接口。

“今日”是默认编排页，不是第二套业务存储。它从出勤、`FollowupTask` 和 `HomeworkAssignment` 派生需要处理的事项；完成、编辑和跳转仍回到来源领域。当前 `daily` 内部页面标识继续指向座位工作台，仅导航文案改为“座位”，避免破坏既有入口和测试语义。

作业台账只记录交付状态与简评，不记录分数或学生端提交。新作业以 `participantStudentIds` 固化布置时的活跃学生快照，并为参与者创建 `unrecorded`（待登记）状态；后来加入班级的学生不自动计为未交。旧作业缺少快照时从已有 `studentStates` 推断。既有 `pending` 继续表示未交，读取时不得把旧作业迁移成待登记。作业生命周期为 `active / closed / archived`，支持编辑、结束、归档、恢复与删除；处理前必须说明关联任务并由老师选择保留或取消。作业状态与任务状态不自动互相覆盖，任务完成后只在老师确认时同步为已交。快捷记录继续写入 `StudentRecord`，可选 `score` 只用于记录与统计，不构成独立积分账户。

学生默认使用 `enrollmentStatus: active / archived` 管理在班状态。移出当前班级仅归档：活跃名单、座位、出勤和新作业排除该学生，历史仍可检索并可恢复。“彻底删除”只用于误导入，并级联移除学生自有档案、出勤、任务、沟通稿、作业/成绩行、评语缓存和抽签引用；共享班费与宿舍事件本体保留，只解除该学生关联。

沟通稿以 `deliveryStatus: draft / shared` 表示生命周期，并可记录分享渠道、时间与备注。复制不改变业务状态；标记分享、恢复草稿和保存会进入动作流水，历史可重新打开原稿。周报事实仍由本地生成，并补充成绩记录与宿舍事件摘要，AI 只按需润色。

常用学科目录保存在当前切片 `settings.subjectCatalog`，默认包含语文、数学、英语、物理、化学、生物、历史、政治和地理，并合并课表、历史作业及成绩中已经使用的学科。修改目录名称不重写历史作业；目录继续随既有工作区备份和手动云同步保存，不新增全局存储键。

成绩单元格继续以兼容字段 `score` 提供当前有效成绩，并可同时保存 `rawScore` 与 `assignedScore`；赋分存在时优先作为有效成绩，否则回退原始分和旧 `score`。`rankConfig` 记录老师是否允许补齐缺失班排，自动计算只写缺失班排、采用同分竞赛排名（1、1、3），不覆盖原表班排且不推算校排。总分缺失时仅在所有已导入科目都有有效成绩时求和排名；学生详情、导出、备份和手动云同步均保留每科与总分的两类分数和排名。成绩进退步统一按班排判断，分数曲线只作为变化背景。

考试生命周期使用稳定考试 ID 联动 `savedExams`、学生 `exams` 与旧考试目录。学生投影保留可选 `source: savedExamRecord`、完整成绩单元格和排名，但删除与覆盖不依赖来源标记，也不按同名、同日或相同分数猜测关联。仅有学生记录的旧考试继续可见、可删除；与完整保存记录同 ID 时优先读取完整记录。删除及其动作流水一次持久化，撤销从当前状态恢复该考试及旧目录、移除本次删除流水，保留期间其他领域的修改。旧残留只在同 ID 最新整场考试动作明确为删除、且没有重新保存记录时从读取模型排除，随后沿正常保存链持久化；无明确删除证据的历史成绩保留，不直接改写原始备份或其他学期。

座位布局保存在当前学期切片的 `settings.seatLayout`，使用 `version: 1` 的拓扑结构：稳定座位 ID 与坐标、分组、相邻边、讲台方向，以及可选的讲台槽位坐标。`slotGridVersion: 2` 与可选标量 `slotGridRows` / `slotGridColumns` 记录连续槽位尺寸；旧槽位版 1 的分组空列只在展示层压紧，不改变稳定 ID、座次或原始存储，老师应用后才保存新版坐标。`seatLayoutGrid.ts` 是编辑与主页面共同的几何边界，`SeatLayoutSurface` 供主页面、排座预览和历史复用，`SeatGroupOverlay` 绘制互不重叠的实际组轮廓；组关系不影响坐标间距。新增框选和原组扩展共享碰撞检测与确认，确认后仅转移相交座位；旧组剩余成员按四向连通性拆分，左上块保留原 ID/名称，其余块生成唯一 ID/组号，全部成员被转移时才移除旧组。裁切组通过可选 `groups[].outline: seats` 保留凹形/孔洞轮廓，规范化、备份和手动云同步均保留该字段；缺省仍沿用旧矩形语义。讲台不参与成员关系，轮廓为其留孔。`repairSeatLayoutGroups` 保证成员独占，保留明确标记的裁切轮廓，拒绝未标记且圈住外组成员的歧义旧矩形；读取修复不删除座位、不改变座次、不回写原始存储。原有围桌/自由坐标布局在进入槽位编辑前仍保留原坐标。`seatOrder` 继续保持数组且其索引对应布局中同索引的稳定座位节点，避免改变旧备份、云同步和写入协议。没有 `seatLayout` 的旧数据仍按八列、相邻两列一组的既有规则读取；自定义布局使用精确座位容量，超出容量的学生留在候补区，不静默扩容。布局变更按稳定座位 ID 保留原座位，删除座位时再依序安置到空位，无法安置者进入候补区。

排座算法不得从数组索引推断自定义布局关系。邻座约束读取 `neighborEdges`，整组约束读取 `groups`，前排约束根据 `frontEdge` 与座位坐标派生；默认布局的输出和旧版八列语义保持不变。布局编辑在座位主界面进入槽位模式，批量框选、单格增删、框选成组与讲台设置只生成草稿，必须由老师点击“应用布局”后才写入当前学期数据。手动组名通过 `groups[].nameIsCustom?: true` 标记，读取、备份、同步及几何修复均保留；自动编号绕开手动名称，编辑名称不改变组 ID、成员及邻座关系。旧数据缺少标记仍按原有自动编号规则处理。

宿舍统计周期配置保存在当前切片的 `settings.dormitoryPeriod`，字段固定为 `anchorDate`、`unit: week | month` 和 `intervalCount`。自然周、自然月和重复自定义周期从当前事件与旧版历史归档事件按真实发生日期派生净加减分；产品不再提供基础分、结转或手动结算。旧 `history` 继续兼容读取，其事件进入统一流水并可正常编辑、删除，但不再产生新的归档。

宿舍事件类型与默认分数保存在当前切片的 `settings.dormitoryPreferences`，随本机整柜备份和手动云同步保存。旧版 `dorm-presets` 与 `dorm-score-memory` 全局键只作为首次读取迁移源，不再写入或删除，避免切换班级/学期时串用设置。成绩及格、良好、优秀阈值保存在当前切片的 `settings.gradeThresholds`，读取时统一限制在 0–100 且保持递增。

行列插入/删除由 `seatLayoutGrid.ts` 的 `changeSeatGridAxis` 统一转换网格坐标：插入只建立未启用的空带，删除仅移除目标带中的槽位与讲台，其余座位保持稳定 ID 和数组顺序，清理失效分组成员及相邻边。编辑器以稳定座位 ID 复用蓝格 DOM，行列变化只播放位移/尺寸过渡，禁止重播启用脉冲造成闪烁；连续操作从当前可见帧续接。编辑器继续保有草稿，删除确认不直接写入学生数据，只有应用布局才经既有稳定 ID 映射重新安置学生；取消整个编辑保留原始工作区。边缘加减控件复用 `IconButton` 的语义颜色与紧凑尺寸，两种轴使用同一组件。

## AI 与网络链路

```text
UI service -> AiApiClient -> VITE_WORKER_URL(Netlify /api，可选)
                         -> direct workers.dev fallback
                         -> Worker -> DeepSeek
```

- Zhang 与 Commercial edition 都优先复用产品授权 token；一次授权同时控制软件登录、设备、云同步和 AI 权益。旧独立 AI 使用码只作为后端兼容路径保留，不再是两版前端的正常流程。
- AI service 负责业务 payload、缓存和返回类型；公共认证由 `AiApiClient` 负责。
- AI 只能生成建议。写入档案、评语素材或记录必须由老师点击确认。
- 评语工作台的 `/refine-comment` 只接收当前选区、有限相邻语境和稳定学生 ID，返回单段替换建议；前端不得在响应到达时自动覆盖或持久化，必须由老师先点“应用替换”，再沿用既有保存动作写入草稿。
- 周报与题目分析采用“本地先算、按需 AI 增强”：`teacherAiService.ts` 按事实签名缓存结果；`/generate-weekly-draft` 和 `/analyze-score-items` 不在页面打开时自动调用。题目分析只向 Worker 发送本地统计、知识点和稳定学生 ID，不发送整个工作簿。
- Worker 公共路由新增或删除时，必须同时通过 `cloudflare-worker/test/routes.test.js`。
- AI handler 在 payload 校验后、调用上游前统一经过 `AiRequestContext`/usage 边界：Cloudflare Rate Limiting 负责短窗口保护，`ACCOUNT_COORDINATOR` 按 actor/UTC 日串行执行持久计数，保留原 KV 键作为兼容镜像；协调器失败返回 503，中止上游请求。未绑定协调器的旧部署仍保留旧 KV 兼容路径。

## PWA

`vite-plugin-pwa` 为两种 base 生成 manifest 和 service worker。静态应用壳、哈希资源和图标进入 precache；API、Worker、同步和第三方请求不缓存。本地 XLSX 库（约 861 KiB）不进 precache：`vendor/**` 被 `globIgnores` 排除，改用运行时 `CacheFirst`（cache 名 `xlsx-vendor`），并在成绩与名单/备份工作区挂载时空闲预热一次，首次联网访问后离线导入仍可用。发现新 service worker 时只显示提示，用户点击“立即更新”后才刷新。

成绩、宿舍、班费、历史、名单/备份、AI Companion 面板、Comment Workbench 和学生详情成绩趋势图是非首屏异步模块；AI 浮动入口、登录、应用壳、默认今日页和常用座位/出勤/任务保持同步加载。目的页加载时沿用 `data-motion-pending` 与 `MotionSwitch` 保留旧画面；不得提前挂载隐藏的业务页、延迟数据提交或重建状态控制器。recharts/charts-vendor 只允许被异步 chunk 引用，不得回到入口的静态导入链。构建预算固定为入口/单个异步 JS gzip 各 220 KiB，PWA precache 2.25 MiB，XLSX vendor 单独报告。2026-07 的入口约 159 KiB、precache 约 1.4 MiB 为历史测量；本次优化前的 `1262296` 入口为 217.0 KiB、precache 1.96 MiB，后续对照同一命令的测量结果，不能把预算上限视为目标。

## 设计原则

- 保持一个持久状态源，临时弹窗、导航、动画和撤销栈留在组件状态。
- 保持内部纯函数与 I/O 边界分离，先测试数据转换，再调整组件。
- 不把 secret、DeepSeek key、产品码或管理员 token 放入前端或 Git。
- 不通过提交 `dist` 发布；两个前端都由 CI 重新构建。

## BoardUI 预览适配

独立预览分支通过 `ui.tsx` 包装 `src/components/base/` 下的 BoardUI 按钮与分段控件源码，继续保留应用原有 props 和状态边界。`src/utils/cx.ts` 使用 tailwind-merge；分段控件使用 react-aria-components。React 保持18，按钮使用 forwardRef。BoardUI 主题与字体合并到现有 `src/styles/theme.css`，没有第二套主题入口。迁移范围和实际验证记录见 `docs/BOARDUI_PREVIEW.md`。

## 2026-09 审计修复边界

本机编辑使用 `useWorkspaceWriteAccess` 获取同一 origin 文件柜的 Web Lock；其他窗口提示关闭编辑窗口后重试。缺少 Web Locks 的环境保留存储版本核验。`writeBook` 在写入前核对本窗口接受的原始文件柜版本，外部修改后暂停保存并允许先导出当前未保存内容，再由老师确认读取最新数据。导出、手动上传、切换学期及退出必须检查保存结果，保存失败时停止后续动作。文件柜及备份版本、键、载荷保持兼容。

`studentIdentity.ts` 是名单、成绩与逐题表的身份匹配边界：稳定 ID、唯一学号、唯一姓名；明确不同的学号不允许姓名兜底，同名歧义不得领取其他学生档案。新学期只复制在班名单，并重建宿舍成员。题目缺考与空值保留 null，非法得分要求核对；无学生关联的行保留统计但不生成个人跟进。样本最高分仅作为待确认的满分，老师确认后才可调用教学 AI。AI 结果绑定考试及题目数据签名。

`useWorkspaceDraftState` 以工作区、业务对象、字段缓存普通业务草稿（`seat-manager-form-draft-v1:*`），覆盖跟进、作业、班费、宿舍事件、快捷记录和周报。缓存不进入正式业务数据、备份或云端。正式提交清理对应内容；敏感凭据和明确取消即丢弃的布局草稿不缓存。共享 ModalShell 负责焦点、Esc 与关闭过渡，必填业务日期使用 DatePicker.required，日期范围与可选截止日仍可清除。

任务页与今日共用 App 的跟进创建、完成、结果与撤销入口，字段级撤销保留后续无关修改，作业联动仅撤回该生的登记。默认座位与自定义座位共用 SeatLayoutSurface，继续使用同一拖动实现。抽签增加可选 roundId，重开一轮必须确认；当日完整历史用于去重，旧日历史仍只保留 50 条。今日计数直接来自队列，归档学生出勤不进入当前待处理队列。

Worker 的 `worker-entry.js` 导出稳定应用及 `AccountCoordinator`。`ACCOUNT_COORDINATOR` 为 SQLite Durable Object，按既有授权键或额度日键分片；每个对象串行处理读改写。首次读取从原 KV 迁移，之后对象存储为授权及计数的权威值，原 KV 保留相同键和形状的镜像。设备绑定、解绑、清空和管理员更新经同一对象处理，管理员普通修改保留最新设备列表。公共 HTTP 路由、Netlify allowlist 和全部 secret 名称不变；手动云端班级数据仍沿原 KV 存储，不进入协调器。

## BoardUI 功能一致性修复（2026-09-22）

`dateKey.ts` 的 `timestampToLocalDateKey` 是 ISO 时间戳到本地业务日期的唯一转换入口；已经保存的 YYYY-MM-DD 业务日期保持原值。任务通知使用 `getDueFollowupNotifications`，历史列表、学生时间线、来源速览和周报使用同一本地日期，原始时间戳不改写。`hasPendingDormitoryPunishment` 统一学生关注与周报的宿舍待处理条件：存在非空处理措施且尚未完成；没有措施的表扬、备注和单纯扣分仅作为事件统计。

`useWorkspaceDraftState` 继续沿用每个班级/学期/表单的草稿键。在存储写入失败或删除失败时，用会话内的最新值或清空标记阻止旧磁盘草稿回流；切换作用域后的旧回调不修改新表单。正常存储仍以磁盘数据为准，非法 JSON 与 null 对象草稿回退初始值。会话内恢复无法替代磁盘写入：浏览器彻底关闭或刷新后，未落盘内容仍无法保证恢复。草稿不进入业务备份或云同步，原有取消保留草稿、提交后清理的语义不变。

## 班级职务与负责人

`settings.classDuties` 是当前班级/学期的职务唯一来源（version 1）：`roles` 保存稳定 ID、名称和 class/subject 分类；`assignments` 保存每个职位的学生 ID 数组，允许一人多职与多人同职；`groupLeaders` 和 `dormitoryLeaders` 分别按稳定座位组 ID、宿舍 ID 指定一位负责人。旧数据未配置时才生成常用目录，显式空目录保持为空。目录可新增、改名和删除，删除时连同该职位任职一起清理。

`state/classDuties.ts` 共用读取、规范化与学生任职规则，`seatManagerController` 在每次状态更新后统一过滤归档/删除学生、失效职位、失效组/宿舍及已调离的负责人，`legacyStateAdapter` 对旧导入和备份恢复使用同一规则。离组后再调回、归档后再恢复均不自动复职；撤销删除宿舍的显式恢复动作会恢复仍有效的原宿舍长。应用布局和历史布局使用一次原子状态更新，避免新座位顺序与旧分组的中间状态误清理组长。

沿用 workspace book、legacy settings、JSON 备份及手动云同步，不增加存储键或公共接口。升入新学期仅复制职务目录，清空三类任职；旧学期保留原安排。班级职务抽屉延迟加载，学生档案提供独立的“调整职务 / 保存职务”，未保存名称和人员选择使用工作区草稿缓存。组长以现有座位组为范围；宿舍长从当前宿舍在班成员选择。职位不影响成绩、行为标签或任何自动处罚。


## 跟进类型与登记撤销

`settings.followupTypes` 保存当前班级/学期的可选跟进类型字符串数组；缺失或非法配置回退五种既有默认类型。共用 `FollowupTypeField` 覆盖任务创建和编辑，支持目录增删改、重复/空名称校验及工作区草稿。任务本身仍保存原字符串，删除/改名目录项不重写历史任务或业务来源，编辑旧任务时显示“原类型”。沿用 settings 的工作区、备份、手动云同步与新学期复制路径，不新增存储键和接口。

`useRegistrationUndo` 共用出勤快速/详细、学生详情出勤及作业快速登记的撤销。每个事务只记录改变的学生条目、前后值、动作和活动撤销回调；同一条目、同一动作在 6000ms 前再次按下恢复完整原条目。另一状态作为新操作；过期后同状态不再撤回。`useAttendanceUndo` 共用出勤日期与记录恢复适配；作业按作业 ID + 学生单元格恢复。备注、请假起止时间和原无记录状态都保留；不同学生/其他日期/其他作业不受影响。后续改动与事务后值不一致时拒绝陈旧撤销；作用域切换丢弃重复点击资格，撤销成功只能使用一次。显式“撤销上一步”继续可用，批量事务保持整体撤销，存在后续冲突则不覆盖。

分段控件仅在传入 `onPress` 时逐次响应所选按钮，其他导航与筛选保持原有选择语义。作业详细下拉是明确选择值，使用显式撤销；宿舍处理复选框和座位锁定已可再次点击切回，无需限时逻辑。任务完成、取消涉及队列移除或关联业务确认，保留其既有恢复/撤销入口；删除、保存和批量确认按钮不作为再次点击撤回的目标。

### 评语保存与座位恢复边界（BoardUI 先行）

`aiCommentService` 和局部润色接口只返回候选结果。评语工作台与学生抽屉把候选写入按班级/学期隔离的本机草稿缓存；单人保存、保存并下一位或批量确认保存之后，才更新学生正式评语。`useScopedRequest` 统一取消过期请求并检验作用域，批量生成还校验每位学生的编辑版本，保留请求期间的手动修改。

`commentPersistence` 将直接保存的评语及标签增减同步到当前 `SeatManagerController`，只修改该学生的评语和相关标签，不加载整个旧快照。控制器的同步状态引用保证随后自动保存、关页或跨领域操作看到最新评语，同时保留尚未落盘的档案/座位等修改；工作区不匹配时拒绝应用。它是同一个本地状态的兼容写入桥接，不改变手动云备份/恢复流程。

`seatWorkflow` 负责布局、顺序、锁定和受排座影响的组长任命的整体撤销。撤销保留其他领域的新修改、后续锁定和新任命；已离班学生不重新入座。新 `SeatHistorySnapshot` 附加可选 `studentIds`、`lockedSeats`，继续保留原来的姓名 `seats`。旧快照缺少 ID 时只恢复可唯一匹配的姓名；同名歧义留空并提示核对，缺失自定义布局表示恢复默认布局。名单重排与手动移动均遵守座位锁定。

随机排座默认参考当前座次及最近最多五份含稳定学生 ID 的历史快照，优先满足原有硬约束和软约束，再降低原座重复与邻座重复；锁定座位不计入原座惩罚，只有姓名的旧快照不参与轮换评分。规则与预览复用持续挂载的 `SeatBoard`，预览阶段只把候选顺序传给渲染、调座与等待区回调，评估信息另在工作面抽屉显示；候选座次留在临时状态，离开或取消时丢弃；预览显示重复情况，老师应用后追加标记为“自动轮换”的普通座位快照；撤销该次排座时一并移除相应快照。开关位于 `seatSettings.rotateWithHistory`，旧设置缺省为开启，仍沿用原座位历史和整柜备份链路。
