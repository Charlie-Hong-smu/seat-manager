# 全新合成测试空间的严格空初始化

这是 Zhang 先行的受控测试入口，默认关闭，不是已有教师空间迁移的替代流程。本地实现与合成验收不代表已发布或获准打开生产配置。

## 授权与风险边界

KV 404、重复空读取、当前 Worker 100% 流量都不能证明历史上从未写入或旧请求已经结束。此入口不签署 oldWritersRetired、backupRetained，不产生虚假 cutoverId，不读取或导入旧快照作为新权威。用户必须明确确认目标空间、全部班级学期只含虚构数据，以及未知/迟到的旧写可能被排除和舍弃。它不适用于既有生产教师空间。

资格来自受信部署配置和现有权威授权记录，客户端不能自报：

- `SYNC_FRESH_INITIALIZATION_ENABLED="false"` 为默认总门禁；`SYNC_FRESH_TEST_GRANTS="{}"` 为默认许可。只有总门禁 true 且许可 JSON 对象恰好有一个完整 `tenant-<64位十六进制>` 空间键才可能开放。
- 该项必须含 purpose=`synthetic-test`、displayName、licenseCreatedAt、approvedAt、expiresAt；名称以“同步合成测试-”开头且与当前记录完全匹配。创建时间也须与权威记录完全匹配，并距现在不超过48小时。许可批准时间不能早于创建或超过未来5分钟；许可有效期不超过批准后48小时且尚未结束。
- 当前授权必须仅含 zhang、maxDevices=3、AI关闭。原产品状态、期限、设备会话和租户检查仍在路由及协调器队列内执行。用户自行设置的产品期限保持，不改为初始化许可期限。
- AccountCoordinator 的永久删除身份记录必须不存在；删除后重新签发的同码/同空间不能因新的 createdAt 冒充首次授权生命周期。缺少此权威协调器时拒绝，不退回 KV 作资格证明。
- 准入与当前可见来源、既有 head 检查分开；完整准入不是历史无写证明。全新48小时内的普通教师授权也不会因这些条件自动获准，仍需唯一的测试许可和用户明确合成确认。

运营填许可只能使用本次批准的空间 ID 与已核实的非敏感记录时间/名称；不读取浏览器密钥或把产品码放入配置。姓名/时间/有效期缺项、错误或门禁关闭均拒绝；配置中不得用前缀、通配符或多个测试目标。

## 协议、持久化与恢复

复用现有 POST `/sync/migration`，增加 action=`initialize` 和 `cancel-initialization`；Netlify 既有 `/sync/` 公共前缀照常转发，无新增公共路径、鉴权权限或秘密。所有 status/load/save 及初始化仍进入同一 SyncCoordinator。

initialize 必须携带稳定 operationId 和 acknowledgeAllWorkspaces、acknowledgeSyntheticTestOnly、acknowledgeIgnoreLateLegacy 三项 true。先在 SQLite `fresh_initialization` 持久记录 checking 屏障，再读取本空间 KV；所有新旧 save 均被冻结。任何既有 head（含删除 tombstone）、保留的 migration_meta/migration_chunks 行或可见 KV 值均拒绝；已 abort 的 operation 和备份块仍是已知来源，不能因 KV 不可见而忽略，也不清理它来绕过。可见的空字符串、JSON null 和坏 JSON 也不被当作空键。

在事务前再次核对现行授权及许可指纹。事务同时创建 strict=true、exists=false、revision=0、独立 epoch 的空 head 和完整幂等回执；head 不伪造迁移证明，标记 `fresh-test-empty-strict` 来源。head/回执全有全无，初始 mirrorPending=false，不删除 KV。并发不同 operationId 仅一方可创建；相同 ID 的有效重试返回同一来源/epoch/回执，不重新初始化。门禁关闭仍拒绝操作重放，可通过只读状态核对已完成结果。

中断或事务失败保留 checking；同 operationId 可跨重启恢复。另一 ID 或变更的许可不能接管。只有 checking 阶段，当前授权用户才可明确 cancel-initialization，即使部署已关门禁；取消只释放冻结。complete 即使 head 故障丢失也不能取消或降为 cancelled，必须保持失败关闭。提交后永久 strict，不取消 head。删除清理未完成屏障并写 tombstone；保留已完成来源与严格性，旧初始化回执不能穿越新 epoch。

若可见旧 KV 是坏 JSON，普通状态读取失败也须通过迁移状态展示 checking 与取消入口，重开后仍可取消；取消不尝试恢复或解析坏来源。已完成记录却缺失 head 时 status/load/save 失败关闭，不能回落 KV 或再次初始化；删除仍从持久回执继承严格性。

head 一旦存在，迟到旧 Worker 的直接 KV 写不进入 DO 权威；后续读取、CAS、重启和删除永不重新导入它。可见非空会拒绝，但最终一致读取可能遗漏更早/迟到来源；该数据不会进入新的空权威，可能只暂存于 KV、被后续兼容镜像覆盖。此风险必须在合成确认中说明，不能据此声称保留了完整旧数据。真实旧空间必须继续正式冻结、封存备份和迁移证明流程。

返回 migrationReady 仍仅表示真实 cutover；initializationReady 和 authoritySource=`fresh-test-initialization` 分别表示受控初始化资格来源。严格空初始化可作为自动协议资格，但还须原自动总开关、精确 `SYNC_AUTOMATIC_SPACES`、版别条件及逐设备明确同意；初始化本身不上传、不绑定、不启用自动。

## 页面与试点顺序

云同步弹窗复用 ModalShell、Button 和 useAppDialog。服务端许可有效才显示初始化动作；checking 显示继续/取消。确认写明完整空间、全部班级学期、虚构数据范围、永久拒绝旧盲写和迟到数据风险。初始化只正式保存现有本机柜，不应用远端、不清草稿/撤销代际、不自动发送。operationId 在按空间 IndexedDB 日志保留，额度失败在云请求前停止；换授权后的回包不建立旧空间绑定。

2026-10-02（UTC）用户在独立审查修复后批准提交推送 main，以全部门禁关闭、名单为空的配置发布 Zhang 与共享 Worker；没有授权填入实际目标许可、风险同意、初始化空间或晋升 Commercial。后续获准的唯一顺序：

1. 新协议默认关闭配置发布后，由用户安全登录独立测试上下文，核对目标 ID、权威创建时间、首次生命周期和 ready/exists；若已有 head 或可见旧快照停止。
2. 仅给批准目标填完整测试许可并打开 fresh 总门禁；migration=false、cutover={}、automatic=false、automatic spaces=[]、Commercial readiness=false 保持。用户明确空初始化。
3. 本机建立合成班级/学期并导出“备份全部班级与学期”，独立可靠留存；立即同步并明确保留本机发布。第二台干净设备明确采用云端整柜，两端确认基线。
4. 关闭 fresh 总门禁并清空测试许可；持久来源保留。仅给该 ID 填自动精确名单并打开 automatic。正式 Zhang 构建另行批准并传入 VITE_SYNC_AUTO_RELEASE=true；当前正常工作流未改变，Commercial继续关闭且不晋升。
5. 验证精确 SHA、产物及发布后，由用户逐设备明确同意全部班级学期，再做合成真机离线/后台/重开试点。

## 停用、备份与验证

先导出整个合成本机柜；初始空权威不能用作恢复文件清空本机。初始化失败可取消；提交后通过自动总开关关闭、移出自动名单及前端停用暂停，手动 CAS 保持，head/epoch/strict/来源不回退。禁止清 DO、以 KV 重建或回滚到只懂 KV 的 Worker。优先修复向前；a3c9433 不识别 fresh 来源，其删除路径也不会复制新来源字段，不能作为已初始化空间的常规后端回滚目标。后端回退兼容性未在本阶段认证，不把版本回滚当作数据恢复。

新增真实 Miniflare/workerd SQLite 回归覆盖竞态、幂等、读取中断、事务回滚/重启、旧写迟到/不可见源、既有 head/非空拒绝、门禁撤回、重新签发、跨空间及确认。前端桥接验证本机柜保持、持久同 ID 重试、quota 和换授权隔离；开启浏览器增加合成初始化确认/取消/覆盖层命中及 Commercial 混版权限保护，全部 mock/路由拦截仅在 e2e。必需检查沿用 AGENTS；本地执行相关两版同步浏览器与新增用例，正式发布必须另核实精确新 SHA 的完整两版浏览器及必需 CI/CD，不能以旧运行或旧 dry-run 替代。
