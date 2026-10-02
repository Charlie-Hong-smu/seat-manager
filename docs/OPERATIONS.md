# 验证、发布与排障

## 本地验证

人工调试 UI 时，默认启动开发服务器：

```bash
cd frontend-react
pnpm dev --host 127.0.0.1
```

打开终端输出的 `/seat-manager/` 本地地址，在登录页点击“进入本地预览”。该入口只在 Vite 开发模式且 hostname 为 `127.0.0.1` 或 `localhost` 时可用，仅创建临时会话，不占用授权设备名额。

`vite preview` 用于验证生产构建、PWA 或发布包，会按生产环境保留产品授权登录，不作为日常 UI 调试入口。

前端统一使用 pnpm：

```bash
cd frontend-react
pnpm install --frozen-lockfile
# 同步状态机联合测试复用 Worker 锁定的本地运行时
(cd ../cloudflare-worker && npm ci)
pnpm check:design
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build:zhang
pnpm check:size
pnpm build:commercial
pnpm check:size
pnpm check:production
pnpm test:e2e:all
```

覆盖率门槛只约束持久状态、导入导出、业务 action 和 AI 数据转换等核心模块：语句/行/函数 70%，分支 60%。Playwright 分为 `test:e2e:zhang` 与 `test:e2e:commercial`；Commercial 的模拟授权只存在于测试浏览器上下文，不会进入生产源码或构建。

`check:design` 验证 `AGENTS.md` 的设计规范入口、`docs/DESIGN_SYSTEM.md`、共享 UI primitives 与核心 CSS tokens 同步存在。它用于防止重构后设计系统入口或基础组件静默丢失；视觉验收仍按设计规范清单和浏览器 smoke test 执行。

手机课堂定向回归：依次运行 `pnpm test:e2e:zhang mobile-classroom.spec.ts` 与 `pnpm test:e2e:commercial mobile-classroom.spec.ts`；两版已加入默认完整集合。用 360/390/430px 合成班级验证等待区原生触摸横滑、名单映射、班费汇总、考试标题/搜索与焦点恢复、课堂记录的草稿隔离/重复保存/撤销、作业连续登记与筛选下稳定学生身份、今日来源往返与切班清空、布局纯点选/覆盖取消、空名单/横屏日期，以及 25 场考试和长学科图表。原始指针事件不能代替原生触摸手势，本用例使用 Chromium CDP touchStart/touchMove/touchEnd。完整验收与真机边界见 `MOBILE_CLASSROOM_WORKFLOW.md`。

开发预览截图可在 `frontend-react/` 运行 `CAPTURE_ORIGIN=http://127.0.0.1:5173 node e2e/mobile-visual-capture.mjs`，把端口替换为开发服务器实际输出；它只使用“进入本地预览”和独立浏览器的合成数据，默认输出 360/390/430px 与 1440px 截图到 `output/playwright/mobile-workflow/`。这是 Chromium 手机仿真；实体 Safari/Android 软键盘、系统文件选择/下载/打印与硬件安全区仍须真机验证。截图与构建产物不进入源码提交。

Worker 使用 npm：

```bash
cd cloudflare-worker
npm ci
npm run check
npx wrangler deploy --dry-run
```

Worker 检查会自动扫描根目录与 `routes/` 下的 JavaScript，并运行本地 Miniflare/workerd 集成测试。集成测试通过真实 Durable Object RPC 检查设备名额和 AI 日额度的并发边界，以及授权删除、旧镜像和重建；测试使用本地 KV、测试专用凭证与上游替身，无需线上 secret，不会请求真实 AI。CI 的 `npm ci` 会安装锁定的运行时开发依赖。

后端与教师操作闭环定向回归：Worker 的 `license-security.test.js` / `account-runtime.test.js` 覆盖停用、到期、删除、解绑、清空及重新绑定的旧凭证拒绝和空间唯一不可变；`ai-payload-safety.test.js` 覆盖可空数字、结构化素材、信息充分性及长周报。前端运行 `pnpm test teacherDataSafety.test.tsx`，然后依次运行两版 `pnpm test:e2e:zhang teacher-data-safety.spec.ts cloud-sync.spec.ts` / `pnpm test:e2e:commercial teacher-data-safety.spec.ts cloud-sync.spec.ts`，检查空班级往返、延迟文件读取切班和恢复时间键配额故障。替身只存在于测试；不得为验证请求真实收费 AI 或真实学生数据。

授权后台保持无构建静态页面。其搜索、筛选、分页和看板计算测试已包含在 Worker 的 `npm run check` 中；本地视觉检查可从仓库根目录启动：

```bash
python3 -m http.server 4174 --directory license-admin
```

打开 `http://127.0.0.1:4174/`。真实管理员密钥只允许保存在本机浏览器，不写入仓库、测试数据或命令参数。

教师流程第二轮回归：`teacher-workflow-safety.spec.ts` 已加入两版默认浏览器集合；定向运行 `pnpm test:e2e:zhang teacher-workflow-safety.spec.ts teacher-data-safety.spec.ts` 及对应 Commercial 命令。覆盖作业只读跳转、请假跨日补备注/返校/CSV、主存储和全部存储失败下的单人及批量评语重试、宿舍第 201 条/撤销/关联纠错、映射不应用后刷新再编辑、忽略取消的晚 AI 返回、字数上下界、周日与未知课表列、班费周期分类、待排/归档/锁定空座与真实拖拽，以及换名单的追加/覆盖。合成 AI 替身只在 e2e 测试中；不能请求真实收费服务或真实数据。完整交接见 `docs/TEACHER_WORKFLOW_AUDIT_FIXES.md`。

## 自动发布

- `.github/workflows/pages.yml`：前端变化时并行运行静态/单元检查、Zhang 两份浏览器验收和 Commercial 浏览器验收；全部通过后，使用 Zhang 第一份验收时生成的构建产物自动发布 Zhang 先行版。
- 每个 CI runner 使用一个浏览器 worker，Zhang 的两个分片仍在不同 runner 并行，避免逐帧动效采样与其他浏览器竞争。浏览器失败时上传相应 `*-browser-failure*` artifact（trace、错误上下文及 HTML 报告，保留 7 天）；这些测试只使用合成数据与测试授权替身。失败仍阻止发布。
- `.github/workflows/cloudflare-commercial.yml`：只按目录变化自动发布共享 Worker 或授权管理页，不再自动发布 Commercial 前端。
- `.github/workflows/promote-commercial.yml`：用户明确说“上线商用版”后，由 Codex传入已在 Zhang 验证的完整 commit SHA；同一入口传入上一稳定 SHA 即为回滚。

Commercial 晋升先通过 GitHub Actions API 核验该完整 SHA 的 Zhang Pages 成功运行：必须是 `main`，且同一次 attempt 中静态/单元检查、两个 Zhang 浏览器分片、Commercial 浏览器检查及 Zhang 部署的 job 和关键 step 全部成功。API 不可读、记录缺失、跳过或失败都禁止发布。验证脚本来自发起 workflow 的版本，应用源码仍严格检出用户指定 SHA，因此旧版本回滚不依赖旧提交是否含新脚本。

有 `Validate release verification contract v1` 成功标记时，复用该次运行的设计、lint、typecheck、覆盖率和双版浏览器证据；保留当前 Commercial 环境变量下的重新构建、`check:size`、`check:production`、部署及发布后的线上人工验收。旧运行没有该标记时仍完整重跑。workflow summary 记录证据 run ID、attempt、SHA 和是否复用。门禁变化必须同步修改核验脚本、契约版本及 `node --test .github/scripts/verify-zhang-release.test.mjs`，不能复用其他 SHA 或跨 attempt 拼接证据。
- `frontend-react/dist` 不进入 Git；根 `index.html` 只是线上入口说明，不是应用 bundle。

Cloudflare workflow 需要 GitHub Secrets `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`；Commercial 前端可通过仓库变量 `COMMERCIAL_WORKER_URL` 指向 Netlify `/api`。Commercial 晋升必须遵守 `VERSION_GOVERNANCE.md`；普通 `main` push 不得改变 Commercial 前端，晋升记录以 workflow summary 中的完整 SHA 为准。

授权运营后台字段或管理员接口变化时，先部署并验证共享 Worker，再部署 `license-admin` Pages。该页面是独立管理员发布面，不触发 Commercial 前端晋升；线上验收默认只读，除非用户明确要求创建或修改真实授权。

## 手动操作

不要把 secret 放在命令参数或仓库文件中。设置 Worker secret：

```bash
cd cloudflare-worker
npx wrangler secret put SECRET_NAME
```

Netlify 代理目前是独立发布面。修改 `netlify/functions/worker-proxy.mjs` 或公共路由依赖后，在确认站点绑定无误时执行：

```bash
netlify deploy --prod
```

该操作会改变线上状态，agent 必须在用户已授权部署时执行。普通代码修改不能默认部署。

## 发布前验收

1. 前端 lint、strict typecheck、`test:coverage`、两个 edition build、`check:size` 和 `check:production` 通过。
2. `test:e2e:all` 同时通过；Commercial 测试不得访问生产授权记录。
3. Worker `npm run check` 和 Wrangler dry-run 通过。
4. 新接口同时存在于 Worker handler、`worker-routes.js`、代理和前端调用中。
   - 教师工作台 AI 路由固定为 `POST /generate-weekly-draft` 与 `POST /analyze-score-items`；两者复用产品授权和既有每日额度，不新增充值或计费配置。
5. 浏览器检查登录、当前 workspace、学生数量和关键本地数据没有变化。
   - 若本机工作区损坏，应进入只读恢复界面；确认自动保存未覆盖原始 `seat-manager-workspaces-v1`，并验证原始导出、有效备份恢复和显式空柜重置。
6. PWA 检查 manifest base；Zhang 为 `/seat-manager/`，Commercial 为 `/`。
7. Zhang 授权登录发送 `edition: zhang`；旧授权记录缺少 `allowedEditions` 时只能登录 Commercial。
8. 自定义座位布局需至少验证：默认八列居中且没有组间空列、两列一组；批量框选、孤立格、跨原组框选、加行列、讲台和取消草稿正常；琥珀色选区清晰，悬停整组后左上角解除按钮可点击，解除不删除座位；1310×690 下旧 66 座全部可见，应用前后稳定 ID、槽位及学生顺序一致，刷新后分组/解除结果保留。新增框选与原组边缘扩展均需保留旧组框，碰撞组红色实线提示，松手弹窗取消不得修改成员；确认只转移相交座位，旧组保留剩余座位，分离块自动拆成独立组且组号不重复。检查 L 形轮廓、讲台孔洞与实际成员一致，组轮廓不重叠，不能仅用外接矩形判定。编辑、应用、悬停、拖选、扩展和跨组拆分结果均需截图查看，截图需等待入场动画完成；另验证键盘与 reduced motion、围桌约束、候补区及历史/排座预览的几何一致性。
   组名编辑需在普通、批量框选、框选成组三种模式下检查悬停入口与解除动作，操作后模式、槽位数不变。输入框自动聚焦，中文输入法确认候选词不得误提交，空名/重名有明确提示；输入组号可保存为“第 N 组”，应用并刷新后仍保留。弹窗取消保留原名称与当前框选模式；布局取消丢弃全部分组草稿。
   行列边缘加减号需检查首端、中间、尾端插入与准确删除；空行列直接删除，含蓝色座位或讲台先确认，取消不改变草稿及框选模式，应用与刷新不丢学生。默认加减号淡小，仅鼠标所在单个控件放大，整排其余控件不变，移开（包括点击后）恢复；键盘聚焦清楚可见、Enter 可用，缩小图标仍保留感应范围，默认、悬停、确认、应用结果均截图验收。
9. 教师工作台需至少验证：今日页不自动调用 AI；课表和作业刷新后仍存在；新作业学生默认为待登记且旧未交状态不迁移；默认九科、自定义学科和快速/详细登记切换正常；全部已交有确认且可撤销；快捷记录可撤销；周报和个人沟通稿只有显式保存才进入历史；题目分析只识别每题一列的宽表；AI 候选必须由老师逐项确认后创建跟进。
10. 跨领域闭环需至少验证：今日事项准确打开并高亮来源；作业未交和题目薄弱学生创建任务后显示关联状态；任务完成可补结果、继续跟进并由老师决定是否同步来源；撤销同时回滚来源和动作流水；删除来源后任务显示灰色说明。
11. 学生生命周期需至少验证：归档后从座位、出勤和新作业活跃名单消失，历史仍可按该生筛选；恢复后档案和旧业务数据完整；彻底删除仅解除共享班费/宿舍事件关联，不删除共享事件本体。
12. 沟通与历史需至少验证：沟通稿可复制、标记分享、记录渠道/备注、恢复草稿并从历史重新打开；真实动作按发生时间排序，多学生事件可被每名关联学生筛选；旧数据只显示“旧数据汇总”。
    本轮补查：未保存编辑刷新后仍是草稿，显式保存后可从历史恢复；任务计划日期与截止日各自生效，清空日期不被重填；跨日请假覆盖区间、预计返校后待确认，实际返校后结束，日记录与导出一致；收费事项支持逐人部分付款、退款、减免及旧收入人工关联，金额上限与调整理由有校验；同一作业多人未交只占一张可见跟进卡，逐人完成和来源同步互不牵连。
    自动座位轮换需检查硬/软约束优先，预览重复原座和邻座提示；应用后历史出现一份“自动轮换”快照，刷新仍在，撤销该次排座同时移除快照。旧姓名快照不参与评分，锁定座位不因轮换评分被移动。
13. 成绩导入需至少验证：无排名文件会询问是否补齐班排，关闭后仍可从“排名设置”重新选择；同分采用 1、1、3，缺考与科目不完整时不生成无效总排名，原表班排和校排不被覆盖；原始分与赋分可同时导入、保存、导出，学生详情每科显示班排；所有进退步文案按班排判断。
    成绩删除需检查考试列表、活跃及归档学生详情、刷新后的持久数据一致；删除最后一场不从学生记录重建，6 秒撤销恢复原始分/赋分/排名和旧目录并移除本次删除流水。`gradeExamLifecycle.test.ts` 覆盖旧记录丢失来源标记、同名同日考试隔离、学生自带旧考试、混合新旧数据、存储失败和旧删除残留。旧残留只按明确的整场删除流水与考试 ID 修复；没有删除依据的历史记录保留供老师管理，不按名称自动清理。

## 常见故障定位

多人事项回归：运行 `pnpm test:e2e:zhang followup-grouping.spec.ts` 与 `pnpm test:e2e:commercial followup-grouping.spec.ts`，两版顺序运行以免覆盖同一 `dist`。验证共同待办一次创建、增删关联、刷新、姓名搜索、完成/撤销与继续跟进；逐人催缴保留独立完成状态及每项动作记录；同源同内容作业跟进合成一个可见事项，逐人处理、刷新和来源同步仍独立。状态测试 `followupGrouping.test.ts` 覆盖来源去重、旧格式与保存读取、共享事项删除学生及今日关联。线上旧拆分数据需先备份并明确确认后处理，不能按标题直接去重。同类审计边界：出勤、学生奖惩/快捷记录按学生分别保存，作业保留一份布置记录与逐人交付状态；宿舍事件和班费流水各为一条共享业务记录，不能按关联人数重复扣分或累加金额。已有 `domainActions.test.ts` 继续保护共享班费金额只计一次。

- 本地正常、线上旧：先看 GitHub Actions/Cloudflare deployment 是否成功，再检查 service worker 更新提示，不先重写业务逻辑。
- 记住登录提前失效：核对浏览器/profile、协议/域名/端口是否一致，是否主动退出/解绑/清除站点数据，以及是否使用了仅 12 小时的本地预览。只检查凭证是否存在和到期时间，不输出 token/授权码。90 天调整须先发布共享 Worker，再发布前端；现存 30 天凭证不会自动续期。双版 `pnpm test:e2e:zhang auth-persistence.spec.ts` / `pnpm test:e2e:commercial auth-persistence.spec.ts` 覆盖关闭重开、期限边界、未勾选和主动退出；Worker 合同测试验证签名到期与 AI/同步复用。
- Commercial 网络失败：检查构建中的 `VITE_WORKER_URL`、Netlify allowlist、代理响应编码头和 direct Worker。
- 新 AI 接口 Worker 正常但商用 404/405：先运行路由契约测试并重新发布 Netlify 代理。
- 浏览器显示 CORS 失败：查看 Worker 结构化日志；顶层异常应返回带 CORS 的 `{ "error": "internal_error" }`。
- 导入失败：先验证真实表头位置、列映射和 XLSX 浏览器库，不假设文件扩展名不支持。
- 本机工作区损坏：先在恢复界面导出原始数据，禁止通过刷新、手动改 localStorage 或反复导入绕过校验；使用已知有效整柜备份恢复，或取得用户明确同意后新建空柜。
- 云同步过大：当前整柜上限 5 MiB，不自动切片或合并；先导出本机 JSON，再评估独立迁移方案。

线上地址、secret 值、授权记录和部署状态都可能变化，应在执行线上操作前实时核验。

## AccountCoordinator 上线准备

Worker 发布入口为 `worker-entry.js`，`wrangler.toml` 包含 `ACCOUNT_COORDINATOR` 绑定及 `v1-account-coordinator` SQLite migration；现有 shared-services workflow 会一起部署配置和入口，代理无新公共路由。

首次晋升前应备份授权 KV，确认旧 Worker 写入已结束并给 KV 留足传播时间，再从原键初始化协调器。既有 KV 仍按原键和格式镜像；后续授权修改必须通过管理员接口，不能直接改 KV 并期待覆盖协调器。回滚 Worker 到不使用协调器的版本会恢复旧 KV 写入；再向前升级前必须校准协调器与 KV，不能直接复用期间已过期的对象状态。协调器不可用时 AI 返回 503，避免在无法计数时继续付费请求。开发检查可设置 `WRANGLER_LOG_PATH` 指向临时目录，避免本机日志目录权限影响 dry-run 输出。

云空间不可变修复发布前，另行取得线上操作授权后只读核实旧 ID 归一化冲突；本地修复授权不允许直接清空或修改线上授权记录。冲突空间拒绝登录/同步/AI，不静默选定老师或移动备份，处理须先备份并明确设计数据与会话迁移。新空间以完整产品码散列生成，删除后所有者保留；旧环境产品码首次登录也需持久 KV 记录以执行设备撤权。没有 KV 的环境回退登录返回 503。已部署协调器的环境继续使用原绑定，无新 migration 或 secret。

发布顺序为共享 Worker、授权管理静态页、按版本治理晋升前端。管理页的新 `displayName` 和只读空间 ID 依赖新 Worker；旧管理页编辑旧 ID 只允许原值，新建时旧代号作为显示名而非存储空间。未触碰的旧设备 token 有兼容窗口，重新登录升级后旧会话失效；教师可能需要重新登录，但本机文件柜不删除。以上是发布准备说明，运行本地回归或 dry-run 不代表已上线。

BoardUI 并行本地验证时，可用 `E2E_PORT=4193 pnpm exec playwright test app-motion.spec.ts` 指定独立端口；商业版同时设置 `E2E_EDITION=commercial` 并另选端口。默认 4173/4174 不变，避免复用另一任务的旧预览产物。


## 安全快照同步门禁与回滚

安全同步发布范围为 Zhang 前端和共享 Worker；没有 Commercial 晋升授权。本次补完在 `codex/safe-sync-completion` 独立工作区交付；2026-10-02 用户允许验收后提交推送该任务分支，等待父任务审查与统一整合，不自行合并/推送 main 或部署。`SYNC_MIGRATION_ENABLED=false`、`SYNC_AUTOMATIC_ENABLED=false`、`SYNC_COMMERCIAL_PROTOCOL_READY=false`、`SYNC_CUTOVER_MANIFESTS="{}"` 及前端 `VITE_SYNC_AUTO_RELEASE` 默认关闭是发布初态，不替老师启用或传送数据。未迁移空间旧 Commercial 的手动 save/load 不变；新一键同步显示迁移未就绪。已经建立 SQLite head 的空间即使关闭迁移门禁也仍用 DO，不能以关闭开关退回 KV。

后续迁移必须先单独批准真实数据操作，保留旧来源备份、取得旧 Worker 版本退役和在途写结束的真实证据，再配置逐空间截断清单。`cloudflare-worker/scripts/sync-cutover-manifest.mjs` 是离线封存工具：在 Worker 目录运行 `node scripts/sync-cutover-manifest.mjs <evidence.json> <retained-backup.json> <manifest.json>`，证据包含 space/cutoverId/retiredWorkerVersion/verifiedAt 和明确的 oldWritersRetired/backupRetained；备份必须是整个原快照或 JSON null。输出文件采用新建、0600，不能覆盖旧文件，不发云请求。清单的 sourceIntegrity 是整个快照排序 JSON 的 SHA-256，包含业务 hash 排除的字段。此工具只记录运营声明，不能自行证明旧部署退役；不能以重复 KV GET、等待固定秒数、客户端版本登记或测试合成清单代替真实证据。

受信部署配置 `SYNC_CUTOVER_MANIFESTS` 以既有空间 ID 为键，配合全局迁移开关只开放获准空间。产品授权教师通过 `/sync/migration` 明确确认全部班级学期，准备后该空间新旧 save 均返回 503。读取候选摘要不符时继续冻结，允许稍后同 operationId 重试或明确取消；受控新 Worker 已接收的旧写以 SQLite 来源见证为准。下载 `/sync/migration/backup` 后客户端校验快照字节摘要与整源摘要，老师确认备份已可靠保留，再提交；服务端从固定备份事务建立 head，不再读 KV。下载文件是带元数据的 JSON envelope，integrity 指 JSON.stringify(snapshot) 的 UTF-8 字节，不能拿整个缩进文件的 SHA-256 比较。重开保留阶段，界面要求重新下载校验；取消只能在迁移完成前释放冻结，完成后不能退回 KV。缺证明的旧 SQLite head 需按同流程补充权威快照备份证明，保留 epoch/revision；不得删除旧 head 后从 KV 导入。

strict 启用还需相应客户端盲写退役：Zhang-only 空间可在已获证明、前后端发布门禁满足且教师整柜确认后启用；包含 Commercial 权限的空间须先明确晋升 Commercial，并取得全部可能盲写客户端的安全退役证据，再开放 `SYNC_COMMERCIAL_PROTOCOL_READY`。队列执行启用时再次读取当前授权版别，不能依赖路由检查时尚未包含 Commercial 的旧判断；不能改版别绕过既有 strict 保护。本轮 opt-in/停用/明确恢复、同空间重开偏好和自动调度已经用合成公共接口验证，但真实空间、混版退役和真机挂起证据仍是生产启用条件。新客户端暂停不撤回服务端 strict，避免旧客户端再次盲覆盖。

逐空间自动开放使用非秘密配置 `SYNC_AUTOMATIC_SPACES`，默认 `"[]"`。只填已明确获准的完整既有空间 ID，不填 state key、显示名、前缀或通配符；缺失/格式错误拒绝全部空间，名单中任一项格式无效也拒绝全部。全局 `SYNC_AUTOMATIC_ENABLED=false` 始终优先关闭；开启全局开关仍只有名单内、具备迁移证明并满足版别条件的空间可启用。Commercial readiness 保持原保护。移出自动名单或关闭全局开关后，活跃客户端下次核对持久暂停，strict/head/epoch 保留，手动 CAS 不停用；幂等重试也返回当前自动资格。迁移清单和自动名单独立，不能用迁移完成或客户端版本登记替代自动授权。本轮发布仅交付门禁和默认关闭配置，名单与截止清单保持空，不晋升 Commercial 或迁移空间；部署状态以精确 SHA CI 为准，后续开放仍须目标与真机验收的单独授权。

定向证据：Worker 的 `npm run check` 保留全部原断言并执行真实 workerd/SQLite 公共迁移测试，覆盖冻结、固定备份、来源见证、陈旧 KV、重启/重复提交/取消、旧 head 补证、近 5 MiB 中文分块和故障回滚、删除闭环，以及实际 `/sync/mode` Zhang-only 正向与混版负向保护。前端 `pnpm test syncProtocol.test.ts syncGeneration.test.tsx syncRuntime.test.ts syncRuntimeGeneration.test.tsx` 覆盖编辑/草稿/真实 React 旧 AI 回包和撤销代际、离线双改、换码、quota、回滚失败和错误分流；两版 `safe-sync.spec.ts` 保留手机 320/390px 与关闭门禁原断言。

开启路径另用 `E2E_EDITION=zhang pnpm test:e2e:sync` 和 `E2E_EDITION=commercial pnpm test:e2e:sync`，构建目录 `.sync-e2e-dist/<edition>`、端口 4295/4296、结果 `.sync-e2e-results/<edition>`，仅此合成测试构建设置 `VITE_SYNC_AUTO_RELEASE=true`。Commercial 的测试运行时 readiness=true 只为验证共享实现，不能据此声称线上混版客户端已退役。正常构建的 `dist` 不受影响，Pages 只上传正常关闭开关的 dist。完整浏览器仍必须运行，不能被开启定向测试替代；本地并行工作区可设 `E2E_ISOLATED_BUILD=true` 和独立 `E2E_PORT`，输出 `.full-e2e-dist/<edition>`。动画逐帧断言应避免同一机器并行浏览器占用。

Pages 发布契约为 v2，复用证据还必须包含两版开启路径步骤成功；旧 v1 只允许走全量验证。Commercial 晋升的全量回退路径对支持 `test:e2e:sync` 的批准提交重跑两版开启测试，旧提交回滚保持原全量检查。没有同一精确 SHA 的成功发布证据不能声称部署完成。

回滚优先撤回 Zhang UI 或关闭能力门禁，保留 SyncCoordinator binding/migration、权威 head、epoch 与 strict 拒绝逻辑。活跃客户端在下一次 head 核对发现自动能力关闭时持久暂停，不再排程上传/拉取，重新开放不会自动恢复；后台/离线客户端回前台才会获知，已发送 CAS 可能完成，手动 CAS 仍保留。已经迁移/strict 的空间不得部署只会 KV 盲写的旧 Worker；若需后端修复，应提交保留新协议的向前修复。兼容镜像不能当作无条件权威恢复源。删除失败会先撤销授权并返回错误，可依保留的授权身份重试 tombstone；不得手工清空 DO head 使旧 KV 再导入。SQLite 历史不是无限备份，老师仍应手动导出 JSON。具体上线准备、旧写证据与恢复步骤见 `AUTOMATIC_SYNC_RELEASE_READINESS.md`。

`syncRuntime.test.ts` 将实际前端 SnapshotSync 直接连接本地 workerd/SQLite，检查两设备同基线 CAS、丢响应/运行时重启、上传继续编辑、干净拉取期间新草稿、班级选择/不循环、删除 epoch、存储失败与换码回执隔离。运行前须安装 `cloudflare-worker/` 的 npm 锁定依赖；Pages 静态验收及旧版 Commercial 完整验证分支已加入该安装步骤，复用成功证据时仍按原规则跳过完整验证。
