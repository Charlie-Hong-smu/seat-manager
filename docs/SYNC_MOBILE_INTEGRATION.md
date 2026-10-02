# 同步与手机任务整合验收

日期：2026-10-02。独立分支：`codex/sync-mobile-integration`；工作区：`output/worktrees/sync-mobile-integration`。

## 输入与授权边界

- 远端 main 基线：`549226d936a2d4e1fa5ff038fa53635550bb36ca`。
- 同步任务：`311108e50a977d6758d3ad2435e8989f5519c5c1`。
- 手机任务：`09ddd198844a0bf392de460f622ea4e1f000d8b3`。

父任务已审阅手机最终 390px 合图，授权在独立工作区统一整合、完成最终代码验收，并提交推送整合分支供核对。此阶段不合并 main、不部署、不删除分支、不扩展功能、不操作真实教师数据或授权空间，Commercial 前端没有晋升授权。主工作区仍归手机任务，保留其分支和未跟踪输出；同步原工作区也保留。

开始时远端上述三个 SHA 均核对一致。`git fetch` 遇到本机既有异常引用 `refs/heads/main 2`；所需对象已经在本机，与远端 SHA 一致，独立工作区基于精确 main 基线建立。没有修改或删除该无关异常引用；后续主干操作如仍受影响应由父任务另行处置。

## 整合审查

先快进到同步提交，再以 `--no-ff --no-commit` 纳入手机提交，保留两个任务提交的历史。共同的 `ARCHITECTURE.md`、`OPERATIONS.md`、`VERSION_GOVERNANCE.md` 和 `frontend-react/playwright.config.ts` 自动合并，无文本冲突。

独立逐文件比对：同步的 33 个非共同文件、手机的 30 个非共同文件均与输入提交字节相同。共同文档同时保留手机课堂临时身份/草稿与导航边界、手机验收命令和版本分类，以及同步权威/迁移/同意/兼容/发布条件。Playwright 两版默认集合均保留全部原测试及新增 `mobile-classroom.spec.ts`；隔离构建、端口、按版报告设置也保留，开启同步仍使用独立配置与临时产物。没有重做产品实现或删除、放宽断言。

生产状态保持：`SYNC_MIGRATION_ENABLED=false`、`SYNC_AUTOMATIC_ENABLED=false`、`SYNC_COMMERCIAL_PROTOCOL_READY=false`、`SYNC_CUTOVER_MANIFESTS="{}"`；`VITE_SYNC_AUTO_RELEASE` 默认关闭，正常验收构建显式设置 false。仅合成开启浏览器测试构建设置 true，不成为正常 `dist` 或发布产物。未迁移空间的旧 Commercial 手动 save/load 兼容合同继续保留。

## 最终代码验收

以下均在本次整合后的源码实际运行，串行浏览器一次通过，没有新增源码修复、重复测试循环或改动原断言。

| 检查 | 最终结果 |
| --- | --- |
| 设计契约 / lint / strict typecheck | 全部通过。 |
| 前端完整覆盖率 | 79 文件、413/413；语句 80.91%、分支 77.13%、函数 82.35%、行 84.96%，超过既有门槛；本机 `--maxWorkers=2`。 |
| Worker 与代理契约 | 61/61；真实 workerd/SQLite 并发、响应丢失幂等、迁移分块事务和重启均通过；仅合成数据。 |
| Wrangler dry-run | 通过，三个生产门禁 false、截断清单 `{}`；未部署。 |
| 发布契约 | 19/19，v2 两版开启步骤与旧证据回退边界通过。 |
| 两版正常构建与 size | 均通过；入口 gzip 208.2/220 KiB，最大异步 gzip 110/220 KiB，precache 2.04/2.25 MiB。 |
| Commercial production | 21 个 JS 均无测试授权或模拟响应；正常编译产物的自动发布常量明确为 false。 |
| Zhang 完整浏览器 | 一次 143/143，12.4 分钟；包含原集合与 9 个手机课堂组合场景。 |
| Commercial 完整浏览器 | 一次 116/116，9.8 分钟；包含原集合与 9 个手机课堂组合场景。 |
| 两版合成开启同步浏览器 | 各 3/3；Zhang 33.2 秒、Commercial 33.9 秒；实际公共鉴权/迁移/mode 与 SQLite，确认、下载核验、开启/停用、草稿与拉取、离线双改/重开暂停、迁移重开及取消通过。 |

完整浏览器独立端口 4393/4394、开启集合 4395/4396；正常完整集合使用 `.full-e2e-dist/<edition>`，开启集合使用 `.sync-e2e-dist/<edition>`，都没有替换正常关闭开关的 `dist`。本机报告在 `frontend-react/playwright-report/<edition>/`，开启截图在 `frontend-react/output/playwright/sync-enabled-phone-<edition>.png`。本轮已查看两版 390px 同步弹窗：文字、空间、状态、44px 操作与底部区域均可达，无横向溢出，复用共享 ModalShell/Button/theme；两版视觉一致。原手机最终 390px 合图已经由父任务审阅，整合未改变其手机源码。

日志与起止源码哈希保留在未跟踪 `output/integration-2026-10-02/`，构建、截图、缓存和日志均不纳入提交。348 个受验收源码/配置文件起止哈希一致。两个原任务的历史证据见 `SYNC_COMPLETION.md` 和 `MOBILE_CLASSROOM_WORKFLOW.md`，不能代替上述整合测试结果。此阶段只交付整合分支，本地通过不构成精确 SHA CI 或部署成功。

实体 Safari/Android、系统键盘/文件操作、安全区，以及同步真机后台冻结/重开仍是明确的设备验收边界。这里的手机浏览器证据为 Chromium 仿真；没有据此开放生产自动同步或声称真实旧客户端已退役。

## 父任务主干整合与发布的最小步骤

1. 审查本整合分支的精确 SHA、最终 diff 和下方证据。重新核对远端 main；若仍为上述基线，可在独立主干工作区快进到已验收整合提交；若 main 已变化，先整合新差异并按实际变更补验收，不能直接覆盖。
2. 在父任务安排的授权范围内正常推送 main，禁止强推。main 的精确 SHA 会触发 Pages 的静态/覆盖率、两版完整及开启浏览器和 Zhang 部署，以及共享 Worker 的验证/部署；等待对应 SHA 的实际成功终态，可恢复的 CI 回归仅修真实失败再核验。不要触发 Commercial 前端晋升。
3. 发布后核对安全公开端点、Zhang 静态产物、版本及开关。关闭状态必须保持，不操作真实空间。CI/发布和线上核验成功之后再由父任务按用户要求收束分支；本轮保留所有任务分支与工作区。

同步生产启用仍需单独批准真实备份/迁移、旧 Worker 退役与在途写结束的真实证据、可靠保留的整源备份、适用 Commercial 明确晋升及旧盲写客户端退役证明、真机后台证据，以及每位老师对全部班级学期和目标空间明确同意。

回滚与数据边界沿用 `OPERATIONS.md`：优先关闭能力或回退 Zhang UI，保留 SQLite 权威、DO binding、epoch/tombstone 与 strict 保护；已迁移空间不能退回纯 KV 旧 Worker 或删除 head 重新迁移。
