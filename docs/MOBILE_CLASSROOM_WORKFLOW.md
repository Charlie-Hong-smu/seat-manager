# 手机课堂与优先流程验收

日期：2026-10-01 至 2026-10-02。基线：`549226d936a2d4e1fa5ff038fa53635550bb36ca`。本地分支：`codex/mobile-classroom-workflow`。按版本治理记为 Zhang 先行，Commercial 仅做兼容构建与本地验收，不代表晋升。2026-10-02 已获授权在验收完成后提交、推送任务分支供审查；不合并 main、不部署，不整合同步任务分支。精确审查 SHA 以本轮交付与对应 git 提交为准。

## 2026-10-02 收尾结果

恢复时 HEAD、工作区与昨日暂停交接一致，未发现 `.agents/` 附加规则；初始无关 `frontend-react/output/`、`output/` 均保留。本次恢复没有新增应用或测试代码修改，起止源码哈希清单一致，故复用同一源码已有的有效静态、单元、Worker 与浏览器证据，只补缺失的验收。

| 验证 | 确认结果与证据 |
| --- | --- |
| lint / strict typecheck / design | 复用 2026-10-01 最终源码成功结果：`static-focus-final.log`；本次仅更新交接与分支授权文档。 |
| 单元覆盖率 | 同一源码 77 文件 / 396 测试通过；statements 81.17%、branches 75.87%、functions 81.53%、lines 84.76%，`coverage-focus-final.log`。 |
| Worker | 同一未改后端 53 测试通过，`worker-check.log`；历史 dry-run 通过，未部署。 |
| Zhang 浏览器 | 全部 143 项已覆盖：昨日最终源码 75 项通过 + 本次剩余 68/68（4.7 分钟）；不是声称今天单次运行 143 项。分区记录 `resume-20261002-zhang-partition.json`，本次日志 `resume-20261002-e2e-zhang.log`。 |
| Commercial 浏览器 | 本次单次完整 116/116（9.8 分钟），含三个手机宽度焦点恢复与全部既有断言；`resume-20261002-e2e-commercial.log`。 |
| 两版构建与体积 | 本次两版均通过；入口 gzip 203.8 / 220 KiB，最大异步 gzip 110 / 220 KiB，precache 2.02 / 2.25 MiB。 |
| Commercial 生产门禁 | 本次通过：21 个生产 JS 文件无测试授权/模拟响应，`resume-20261002-size-production-commercial.log`。 |
| 最新手机/桌面视觉 | 360/390/430px 与 1440px 合成数据重新截图。首个作业学生 Y=423px（桌面 398px），等待列表 288/318/358px；档案完整姓名字号 16px、锁定入口 44px、锁定提示 16px 高，未出现页面级横向溢出。 |

完整报告：`frontend-react/output/playwright/mobile-workflow/resume-20261002/zhang-remaining-report/index.html` 与 `commercial-full-report/index.html`。本次日志、起止源码检查点保留在 `output/mobile-workflow-inputs/`；旧报告、截图与暂停日志没有清理。

手机文字与占位遵守现有 tokens：保留可读正文字号和触控命中范围，通过二级入口、紧凑留白和分层提高主内容占比；不进行新一轮美化。紧凑座位长名保持省略，可点击进入完整档案；课堂记录抽屉同时显示完整学生身份及保存目标。锁定组合图已等待弹窗退出后重拍，未把退出过渡帧用于最终证据。实际 Safari、软键盘、系统文件/打印和硬件安全区仍待真机验证。

最新 7 张组合图位于 `frontend-react/output/playwright/mobile-workflow/resume-20261002/`，均为 Chromium 仿真：

- `mobile-homework-20261002.png`：登记优先，五态、筛选与长名。
- `mobile-waiting-20261002.png`：主座位与可横滑等待区。
- `mobile-quick-record-20261002.png`：学生身份、预设与明确保存。
- `mobile-today-20261002.png`：逾期/今日标签与来源入口。
- `mobile-fund-20261002.png`：金额、笔数与完整最近登记。
- `mobile-seat-information-20261002.png`：省略长名后的完整档案入口。
- `mobile-seat-lock-20261002.png`：完整尺寸锁定/解锁及整宽提示。

应用源码改动范围与下方清单一致。路线图后 3 项、微信小程序、同步开关/迁移、公共路由、数据模型与备份语义均未扩展；同步分支由父任务另行处理。

## 2026-10-01 暂停交接（历史）

已按用户“找一个合适的点就先停”暂停。所有源码、13 张 Library 对照/流程图与本地日志保留；HEAD 仍为上述基线，没有 commit、merge、push、部署或删除分支。初始无关 `frontend-react/output/`、`output/` 保留。

- 最终源码已通过 lint、严格 typecheck、设计检查、77 文件/396 单元测试；Worker 53 项通过，后端未改。最终 Zhang 构建与体积检查通过（入口 gzip 203.8 KiB）。
- 最新 Zhang 完整套件按要求安全中断：75 项通过、1 项中断、67 项未运行。新增 9 个手机组合场景已在本次运行全部通过；旧一轮 143/143 通过不能算最新源码完整验收。
- Commercial 上一轮为 113 通过/3 焦点失败；修复后对应三个手机宽度定向通过。最新共享 Tab 边界及锁定提示修改后的 Commercial 完整套件、最终构建/体积/生产门禁尚未完成。此前 Commercial 构建/体积/生产门禁通过仅作为历史记录。
- 本任务 Playwright 长测试、5194 开发预览、5298 构建预览均已停止；确认没有遗留本任务 5196/5353 预览。未停止其他任务或用户应用。
- 剩余实体 Safari、软键盘、系统文件/下载/打印风险保持待设备验收。没有继续修复或启动新的测试/审查循环；等待用户下一次指令。

## 输入、数据与验证环境

两份 Library 输入已完整材料化并阅读，消费路径均为本机真实文件：

- `libfile_0c64013c51308191afe0e20c829ab822` → `output/mobile-workflow-inputs/2026-10-01-seat-manager-mobile-audit.md`，27,909 字节。
- `libfile_9ff6c85c76448191b48c512044a710f0` → `output/mobile-workflow-inputs/seat-manager-website-roadmap-2026-10-01.md`，18,000 字节。

原报告属于源码审阅。本批先在基线独立本地预览复现，再修改和拍前后对照。全部教师数据为合成：60 名学生（含长名）、48 个已排座位/16 个空座/12 名待排学生、10 项作业、9 科考试、班费流水、逾期跟进及独立空班。课堂记录补查使用 64 人/64 个满座；考试下拉补查 25 场考试。没有真实授权、真实学生、真实备份或收费 AI 请求。

浏览器为本机 Playwright Chromium，360/390/430×844 手机仿真、844×390 横屏与 1440×900 桌面；既有 320px 用例继续保留。开发预览使用 localhost-only“进入本地预览”，生产构建验收的授权替身只在 `frontend-react/e2e/`。原生触摸横滑使用 CDP TouchEvent，未把 pointer 派发冒充手机滚动。未接触实体 iPhone/Android 或 Safari。

## 手机审计逐项结果

| 项目 | 状态与结果 |
| --- | --- |
| S01 等待区窄屏挤占 | 已复现、已修。标题、提示、学生名单纵向分层；名单可见宽度由三个视口均约 16px 变为 288/318/358px。 |
| S02 等待卡禁触摸横滑 | 已复现、已修。触控卡使用 `pan-x pinch-zoom`；等待区与主座位各自原生横滑、主座位纵向滚动有实际位移，分区互不带动，座位顺序不变、无拖拽副本。鼠标拖放保持。 |
| S03 班费登记汇总裁切 | 已复现、已修。手机姓名/状态、金额/笔数、最近登记分行，123.45 元与日期完整可见，不改多人流水计数口径。 |
| S04 名单映射固定双栏 | 已复现、已修。纵向正文滚动，预览宽度由 32/32/61px 变为 344/374/414px；关闭映射未改变名单。 |
| S05 考试标题与搜索挤压 | 已复现、已修。共享 ModalHeader 标题/关闭同排，搜索整宽第二排；AI 入口在模态/覆盖抽屉期间隐藏，避免挡关闭区。 |
| S06 分组缺少纯点选路径 | 已确认、已修。显式“选择座位”累计点选，沿用原矩形成组/邻座规则及覆盖确认；确认取消保留选区，取消整个布局不写数据，应用后重载保留。 |
| S07 常用触控目标不一致 | 已确认、已修。共享分段、指标筛选、步进、日期、选项、移除学生、撤销关闭等常用目标至少 44px；点选调座选中已锁/未锁座位后有完整尺寸解锁/锁定入口，提示另起整宽一行。点击被省略的长名可进入完整档案，默认首屏不增加锁定按钮行。 |
| S08 全局搜索关闭/焦点 | 已确认、已修。共享 IconButton 和 useModalFocus，结果可滚动，结果末项 Esc 关闭后恢复搜索触发器焦点；退出动画保留的旧弹窗不再夺取新弹窗/触发器焦点，也不拦截 Tab。 |
| S09 宽成绩表阅读锚点 | 已确认、已修。手机表头/姓名冻结，姓名可换行；表格自身允许横滑，考试表格同类实例一起处理。 |
| S10 作业登记排在长列表之后 | 已复现、已修。当前作业选择与登记优先；创建、列表和管理在二级入口。10 项作业时首个学生 Y 从 1899/1849/1849px 提前到 423px；桌面仍为 398px。 |
| S11 班费留白与统计堆叠 | 已复现、已修。手机正文/面板 12px 留白，余额突出、收入支出并排；流水和统计计算保持。 |
| S12 成绩 2×2 分隔线 | 已复现、已修。右列左边线、第二行上边线；统计顺序、颜色和数字保持。 |
| S13 收费提交随 60 个标签下沉 | 已确认、已修。创建进入共享抽屉固定 footer；60 人选择后按钮仍在视口内，正文独立滚动，取消不创建收费事项。 |
| S14 触屏行列与讲台操作难发现 | 已确认、已修。粗指针轴提示可见；手机及矮横屏的选中位置提供“座位操作”菜单：讲台、组名/解除、行列增删，完整触控替代入口在网格外。桌面密集角标仍保留。 |
| R1 多考试下拉避让 | 风险已复现、已修。原下拉无可靠边界；改共享可搜索 SelectMenu，25 场考试能滑到最后一项并选择。 |
| R2 实际软键盘遮挡 | 未复现实体软键盘问题，待真机。已验证 Chromium 矮横屏日期/保存/取消可达；日期按实际面板与 visualViewport 定位。 |
| R3 出勤详情与长学科图 | 出勤页面级横向溢出未复现（360px 行宽/scrollWidth 均为 308px）；高行/密集动作已确认并整理为独立动作行。9 科标签拥挤已复现并以内部图表横滑修复，不缩小科名字号。 |
| R4 数字键盘与文件操作 | 金额缺少十进制输入提示已确认、已修 `inputMode=decimal`；真实系统键盘、文件选择/下载位置、打印/PDF 仍待设备验收。 |

## 路线图前四项

1. 手机课堂操作底线：上述结构、滚动、触控、信息层级与共享弹窗修复；保持既有 tokens、字体和动效。降低重复标题、背景和低频入口数量，不全局缩字号。
2. 手机作业登记优先：保留五态、六种筛选、计数/进度、快速/详细、搜索、撤销、未交建跟进及生命周期。连续登记 20 人、筛选下再次点击恢复不会误改下一位；出勤同根实例复用 `useRegistrationRetention`，重新筛选/换查询/换日期/换作业后清空临时保留。未保存创建草稿关闭、横竖屏和重载仍保留。
3. 座位学生快捷记录：课堂记录与点选调座互斥，课堂模式禁止拖动/锁定操作，点学生打开预选身份的 QuickRecordDrawer；预设只填草稿，明确保存按钮才写记录。与通用多人草稿隔离，重复触发只写一笔，保存失败保留内容并回滚记录/流水，撤销移除本笔及对应流水。切班/远端代际后抽屉和旧撤销会话失效，工作区草稿仍按原缓存隔离。
4. 今日队列：手机保留“已逾期/今日截止/需关注/计划处理”标签与来源按钮；从全部队列直达当前业务，再“返回今日待处理”恢复页面、队列开闭和两层滚动位置。返回上下文只消费一次，切班清空。

路线图后续三项（复制作业、新增事实到跟进链、评语素材筛选大改）未实施。没有改微信小程序、教师数据模型、统计、备份/导入格式、Worker 公共路由、KV 键或 secret；同步迁移、自动与 Commercial ready 开关均未打开，界面仍显示本机保存/手动同步。

## 验证与回归记录

以下为暂停时的确认结果与历史验证记录；运行日志均保留在 `output/mobile-workflow-inputs/`。最终收尾结果以上方 2026-10-02 表格为准。

- lint、严格 typecheck、`check:design`、`git diff --check`：最终源码已通过。
- `test:coverage --maxWorkers=2`：77 文件、396 测试全部通过；statements 81.17%、branches 75.87%、functions 81.53%、lines 84.76%。默认并行补跑曾出现 10 个 5 秒超时；限制本机并发后通过，没有延长原超时、删除用例或弱化断言。最终日志 `coverage-focus-final.log`、静态检查 `static-focus-final.log`。
- Worker `npm run check`：53 测试全部通过；`wrangler deploy --dry-run` 通过，仅 dry-run，没有部署。
- Zhang：历史一轮 143/143 通过（14.0 分钟），HTML 报告 `frontend-react/output/playwright/mobile-workflow/zhang-report-final/index.html`。最后补查后完整重跑按用户要求中断：75 通过/1 中断/67 未运行，日志 `e2e-zhang-focus-final.log`；最新构建与 `check:size` 已通过。
- Commercial：历史完整运行 113 通过/3 焦点失败，随后修复定向 3/3 通过，最终完整重跑尚未启动。历史生产构建、`check:size`、`check:production` 通过（21 个生产 JS 文件无测试授权/模拟响应）；最新源码完整构建/生产门禁未完成。
- 最新 Zhang 入口 JS gzip 203.8 KiB / 220 KiB；历史 Commercial 为 203.6 KiB / 220 KiB。最大异步 JS gzip 110 KiB / 220 KiB、PWA precache 2.02 MiB / 2.25 MiB。没有新增运行依赖或改动锁文件。
- 首轮 Zhang 完整套件发现 5 处回归：旧工作区容器层级、通用快捷记录单人按钮文案、共享弹窗祖先结构，以及横屏 resize 后过早测量。修复实现兼容、等待真实布局稳定，全部既有断言保持；对应 4 个旧场景定向通过，横屏/成绩/今日补查 3 项通过，64 满座课堂记录补查通过。中间验证因新增切班撤销隔离自查主动中断，不能算最终全套通过。
- 触屏菜单补充点测：390×844 Chromium，讲台设置/取消、增行、删除行确认取消、整份布局取消均通过；比较已完成既有规范化的持久数据，座位、布局和学生完全不变。日志 `touch-layout-menu-manual.log`。
- Commercial 首次运行在前 33 项通过后遇到本机 exec-server 通道断开，运行器退出、预览进程遗留；保留 `e2e-commercial-interrupted.log`，只停止本任务 5294 预览后换 5297 独立端口完整重跑。这是执行中断，不算完整套件通过，也没有调整断言或超时。
- 随后的 Commercial 完整运行是 113 通过/3 失败，三个手机宽度均暴露考试弹窗退出后争抢全局搜索焦点。正常退出动画的实际 focus 事件已复现：搜索返回触发器后约 150ms，旧考试弹窗再把焦点移回“查看成绩表格”。修复共享 `useModalFocus`，新增 3 条保留旧弹窗/新面板/新触发器/Tab 边界回归；三个手机宽度定向通过，原焦点断言保留。最终 Zhang 重跑中新增手机场景全部通过，但按用户要求在旧 320px 场景处中断，未声称完整通过。
- 360/390/430 手机交互补查通过：等待区展开/收起、座位横纵原生滚动、长名档案入口与完整姓名、44px 解锁后重新锁定。原生主座位横滑约 530px，纵向到 50–98px，座位顺序保持；锁定提示高度小于 40px，没有逐字堆叠。日志 `seat-touch-information-final.log`、`seat-information-capture-final.log`，档案截图等待切换动画完成后重拍。

## 截图与实际文件

原始截图与 8 张前后对照、5 张流程组合图保留在 `frontend-react/output/playwright/mobile-workflow/`。13 张组合图已上传 Library，原始本机文件写回并校验全部 Library xattrs。所有图片均为 Chromium 仿真，不是实体 iPhone/Safari。已人工查看等待区、作业、班费、名单映射、考试、成绩、出勤、今日，以及课堂记录、布局点选、完整档案与锁定入口；1440px 桌面创建/列表/登记并列结构保留。

| 图片文件 | Library ID |
| --- | --- |
| compare-waiting.png | `libfile_a9a286db94b48191a0aee1a2db3a44b0` |
| compare-homework.png | `libfile_8ecd0f15d078819193439135617a78e9` |
| compare-fund.png | `libfile_a64cf8fbdffc81919cc68eb210bcd622` |
| compare-grades.png | `libfile_572dff7955a08191a1e72c20b204acc2` |
| compare-exam.png | `libfile_3859d6e2ab8c8191b2544602d7d65c09` |
| compare-mapping.png | `libfile_a20bd7d133ec8191910ec62286bc47e7` |
| compare-attendance.png | `libfile_b0f3ad179e3081918f24807da02bcb37` |
| compare-today.png | `libfile_ff6cbeace43c8191beb39c840c8a6fd5` |
| workflow-quick-record.png | `libfile_c00167a9190c8191beea7831a0595939` |
| workflow-layout.png | `libfile_7c532c525fb4819194fd697ed62352d3` |
| workflow-today-queue.png | `libfile_8a3dbebdff44819198fa62aa69f38a44` |
| workflow-seat-information.png | `libfile_22ac5142330081918afa9527ef98979a` |
| workflow-seat-lock-action.png | `libfile_0a13c43ecec08191840726cf9a93f7df` |

应用源码实际改动：

- 应用壳与跨页协调：`App.tsx`、`components/AppShell.tsx`、`TopHeader.tsx`、`workspaces/TodayWorkspace.tsx`、`ScoresWorkspace.tsx`、`DailyWorkspace.tsx`。
- 共享交互：`components/ui.tsx`、`StudentPicker.tsx`、`ChartViewport.tsx`、`styles/theme.css`，新增 `hooks/useRegistrationRetention.ts`。
- 工作区：`SeatBoard.tsx`、`SeatLayoutDesigner.tsx`、`QuickRecordDrawer.tsx`、`HomeworkPanel.tsx`、`GradesPage.tsx`、`ExamTableModal.tsx`、`FundCollectionsPanel.tsx`、`workspaces/DataWorkspace.tsx`、`AttendanceWorkspace.tsx`、`ClassFundWorkspace.tsx`。
- 验证：`ui.test.tsx`、`QuickRecordDrawer.test.tsx`、`useRegistrationRetention.test.ts`、`e2e/mobile-classroom.spec.ts`（9 个组合场景）、`mobile-classroom-fixtures.ts`、`mobile-visual-capture.mjs`、`mobile-contact-sheets.mjs`，两版 Playwright 默认集合加入新用例。
- 持久文档：本文件及 `ARCHITECTURE.md`、`OPERATIONS.md`、`DESIGN_SYSTEM.md`、`VERSION_GOVERNANCE.md`。

共享模式排查已覆盖 ModalHeader 全部调用、日期/选择控件、学生移除、ActionToast、班费裸图标、出勤和作业筛选登记。刻意保留：布局编辑“取消”丢弃本次局部布局；新建作业/课堂记录关闭保留未保存草稿；桌面密集轴/锁定角标不扩大以遮挡相邻座位，触屏有网格外完整点选入口。ToolDrawer 的焦点 effect 已在 open=false 时释放，未套用专为保留到卸载的旧模态组件修复；既有抽屉退出断言保留。没有把这些不同取消语义统一改成清草稿。

初始无关改动只有未跟踪的 `frontend-react/output/`、`output/`，均保留；本批只在它们之下追加输入、截图和日志，没有清理既有内容。源码提交排除 secrets、构建产物、缓存、本地工具状态、截图与日志。实体设备不可达是剩余验收边界；本次只推送任务分支供审查，合并及发布决定留给父任务与用户。
