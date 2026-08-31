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

Worker 使用 npm：

```bash
cd cloudflare-worker
npm ci
npm run check
npx wrangler deploy --dry-run
```

授权后台保持无构建静态页面。其搜索、筛选、分页和看板计算测试已包含在 Worker 的 `npm run check` 中；本地视觉检查可从仓库根目录启动：

```bash
python3 -m http.server 4174 --directory license-admin
```

打开 `http://127.0.0.1:4174/`。真实管理员密钥只允许保存在本机浏览器，不写入仓库、测试数据或命令参数。

## 自动发布

- `.github/workflows/pages.yml`：前端变化时检查并自动发布 Zhang 先行版。
- `.github/workflows/cloudflare-commercial.yml`：只按目录变化自动发布共享 Worker 或授权管理页，不再自动发布 Commercial 前端。
- `.github/workflows/promote-commercial.yml`：用户明确说“上线商用版”后，由 Codex传入已在 Zhang 验证的完整 commit SHA；同一入口传入上一稳定 SHA 即为回滚。
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
13. 成绩导入需至少验证：无排名文件会询问是否补齐班排，关闭后仍可从“排名设置”重新选择；同分采用 1、1、3，缺考与科目不完整时不生成无效总排名，原表班排和校排不被覆盖；原始分与赋分可同时导入、保存、导出，学生详情每科显示班排；所有进退步文案按班排判断。
    成绩删除需检查考试列表、活跃及归档学生详情、刷新后的持久数据一致；删除最后一场不从学生记录重建，6 秒撤销恢复原始分/赋分/排名和旧目录并移除本次删除流水。`gradeExamLifecycle.test.ts` 覆盖旧记录丢失来源标记、同名同日考试隔离、学生自带旧考试、混合新旧数据、存储失败和旧删除残留。旧残留只按明确的整场删除流水与考试 ID 修复；没有删除依据的历史记录保留供老师管理，不按名称自动清理。

## 常见故障定位

多人事项回归：运行 `pnpm test:e2e:zhang followup-grouping.spec.ts` 与 `pnpm test:e2e:commercial followup-grouping.spec.ts`，两版顺序运行以免覆盖同一 `dist`。验证共同待办一次创建、增删关联、刷新、姓名搜索、完成/撤销与继续跟进；逐人催缴保留独立完成状态及每项动作记录。状态测试 `followupGrouping.test.ts` 另覆盖作业/成绩/出勤来源去重、旧格式与整柜保存读取、共享事项删除学生、今日/个人周报/历史的关联完整性。线上旧拆分数据需先备份并明确确认后处理，不能按标题直接去重。 同类审计边界：出勤、学生奖惩/快捷记录按学生分别保存，作业保留一份布置记录与逐人交付状态；宿舍事件和班费流水各为一条共享业务记录，不能按关联人数重复扣分或累加金额。已有 `domainActions.test.ts` 继续保护共享班费金额只计一次。

- 本地正常、线上旧：先看 GitHub Actions/Cloudflare deployment 是否成功，再检查 service worker 更新提示，不先重写业务逻辑。
- Commercial 网络失败：检查构建中的 `VITE_WORKER_URL`、Netlify allowlist、代理响应编码头和 direct Worker。
- 新 AI 接口 Worker 正常但商用 404/405：先运行路由契约测试并重新发布 Netlify 代理。
- 浏览器显示 CORS 失败：查看 Worker 结构化日志；顶层异常应返回带 CORS 的 `{ "error": "internal_error" }`。
- 导入失败：先验证真实表头位置、列映射和 XLSX 浏览器库，不假设文件扩展名不支持。
- 本机工作区损坏：先在恢复界面导出原始数据，禁止通过刷新、手动改 localStorage 或反复导入绕过校验；使用已知有效整柜备份恢复，或取得用户明确同意后新建空柜。
- 云同步过大：当前整柜上限 5 MiB，不自动切片或合并；先导出本机 JSON，再评估独立迁移方案。

线上地址、secret 值、授权记录和部署状态都可能变化，应在执行线上操作前实时核验。
