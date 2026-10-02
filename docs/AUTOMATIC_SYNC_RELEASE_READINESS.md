# 自动同步上线准备（2026-10-02）

基线 `9a6d98f373938a55a6e96d3ca2946698b13b4107` 已在 main，Zhang 与共享 Worker 部署成功，Commercial 前端未晋升。后续有限发布仅包含暂停响应修复、两项回归及三份文档；精确提交、CI 与发布状态以 `output/auto-sync-readiness-2026-10-02/` 的发布记录为准，不能以本文代替成功 CI。生产开关保持关闭，未读取或修改真实教师空间。新设计原型由另一工作区处理。

## 剩余门槛

| 项目 | 已有证据 | 尚缺 / 下一步 |
| --- | --- | --- |
| 协议、迁移与恢复 | 真实 workerd/SQLite 合成 CAS、分块、重启、冻结、固定备份及恢复演练通过 | 指定实际试点空间，可靠留存各设备和旧云来源备份，并在授权范围验证恢复 |
| 旧写退役 | 只读部署元数据确认当前 Worker 版本承接 100% 流量 | 所有可写路由、旧客户端及未知在途请求的实际退役证据 |
| 活跃客户端响应停用 | 本次新增上传/拉取暂停回归，旧代码均失败、修复后均通过 | 按精确 SHA 核对修复发布，再进入后续试点门槛 |
| 正式自动入口 | 合成开启构建两版各 3 项浏览器通过 | 当前正式 CI build 未传入开关，重跑仍关闭；需批准具体通道的构建配置 |
| Commercial 权限空间 | 严格模式仍拒绝未满足兼容条件的启用 | 明确晋升已验收 Zhang SHA，并证明旧盲写客户端退役；访问 Zhang URL 不能绕过 |
| iPhone 后台与重开 | Chromium 手机视口、持久 profile、离线重开通过 | 真机 Safari/PWA 合成两设备实测，不能用模拟代替 |

当前在线 Worker 版本为 `439480d1-e603-4c2d-9953-6aab2c352083`，部署时间 2026-10-02 07:25:55 UTC，100% 流量。只读证据在 `output/auto-sync-readiness-2026-10-02/worker-deployments-read.json`。没有新建凭证、账号或服务。

## 需要指定的范围

1. 一个现有授权的合成测试空间及桌面、真实 iPhone 操作人。若没有测试授权，另行批准在现有服务创建测试授权；不擅自创建或放宽 localhost 预览鉴权。
2. 后续真实试点的既有空间、负责备份/恢复及确认启用的老师。空间 ID 在现有弹窗核对，产品码、token、学生快照不贴入聊天或传到新服务。现在没有可合法代选的真实目标。
3. 目标授权的 `allowedEditions`：只有 zhang 可走 Zhang-only；包含 commercial 即须明确晋升和退役证明。不能修改授权权益绕过门禁。
4. 旧写退役证据负责人和准确的配置/数据操作授权。可读部署元数据不等于已批准真实数据迁移。

## 旧写证明

盘点目标空间全部桌面、手机、PWA 和旧 Commercial 写入者；逐台导出整个本机柜、停止旧上传，并记录每个已发送旧写的最终结果。不同设备业务 hash 不同，由老师选择权威整柜或分别留存，不能自动合并。超时或未知请求不能签为已经结束。核对所有可写 Worker 路由及代理已经通过同一协调器。

100% 新版本分配不是旧请求结束证明。HTTP Worker 在客户端连接期间没有固定墙钟期限，`waitUntil` 的 30 秒也不能作为部署后的收口保证。[Cloudflare Workers 时限](https://developers.cloudflare.com/workers/platform/limits/#duration)

KV 是最终一致存储，跨地点更新可能需要 60 秒或更久，同地点可见也没有保证。因此固定等待、重复读取相同 hash、客户端版本登记或暂时零请求不能独立证明退役。[Cloudflare KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/#consistency)

prepare 在协调器队列持久冻结后拒绝新旧保存；来源优先采用同一截断边界内已确认的 SQLite 见证，否则须匹配独立留存旧来源的完整摘要。prepared 固定备份后，迟到的旧 Worker 直接 KV 写不进入提交 head，重启不重新取 KV。本机合成测试证明的是隔离行为，不是线上请求已经结束。封存工具的 `oldWritersRetired:true` 是运营声明，必须附实际证据，不能用新版本 ID 补写。证明不足则继续关闭，不任意轮换密钥、改命名空间或扩大权限。

## 备份与恢复

独立留存每设备的全部班级学期 JSON、旧云来源、空间及完整摘要；放在用户控制的位置。SQLite 历史、KV 镜像及同设备唯一下载目录不能替代独立备份。先用合成数据在隔离存储演练。

prepare 后下载迁移封装文件，重开后重新校验 space、operationId、cutoverId、bytes、原始 integrity、完整 sourceIntegrity 和业务 hash。正确的业务 hash 不能替代完整摘要。该封装不能直接作为整柜导入：校验后提取 `snapshot.workspaceBook`，旧单班提取 `snapshot.data`，通过原导入预览，由老师明确确认覆盖。`snapshot:null` 表示原云端无快照，不能据此清空本机。恢复前停用自动模式、导出当前柜；恢复是新本机修改，重新核对后才能明确恢复自动模式。

本次演练实际调用合成空间公共迁移接口，下载并落盘两班整柜，重启 workerd/SQLite，重读文件，经生产 `verifyMigrationBackup` 和原导入函数仅写一次；未知字段及内容 hash 保留，篡改拒绝，quota 失败保留旧柜/代际，重复 commit 仍 revision 1。使用 JSDOM 隔离存储，未触碰真实浏览器。结果在 `output/auto-sync-readiness-2026-10-02/restore-verified/restore-rehearsal-result.json`；脚本 `restore-rehearsal.mjs` 的合成退役声明不能用于真实空间。

## 分阶段配置与操作

| 阶段 | 前端与服务端配置 | 操作 |
| --- | --- | --- |
| 当前 | 正式入口关闭；migration=false、automatic=false、commercial readiness=false、清单为空 | 保持手动备份/恢复；未迁移空间“立即同步”提示迁移条件 |
| 合成真机试点 | 批准具体构建通道；仅列出批准合成空间清单，migration=true，automatic=false | prepare、下载、恢复验证、老师明确 commit；失败在提交前明确 abort |
| 合成自动试点 | 正式产物准确 SHA/配置验收，确认开放覆盖范围后 automatic=true | 两设备立即同步确认同版，各自亲自同意全部班级学期并启用 |
| 真实试点 | 真机合成验收完成，另行批准真实目标及备份/截断配置 | 重复 prepare / 下载 / 校验 / commit / 版本选择及逐设备明确启用 |
| Commercial 权限空间 | 明确晋升同一已验收 Zhang SHA，旧盲写客户端退役后才 readiness=true | 未迁移其他空间保留旧手动合同；不替既有老师开启 |

当前 Pages / Commercial 正式 build **没有传入** `VITE_SYNC_AUTO_RELEASE`，只重跑原工作流仍关闭。后续须在批准通道显式调整构建配置，保留另一通道默认关闭，并验证实际产物、精确 SHA 和 CI；合成开启构建不等于生产开放。本阶段没有修改工作流、仓库变量或线上安全设置。

`SYNC_AUTOMATIC_ENABLED` 是全局能力开关，迁移清单不是每空间自动 allowlist。开启前必须核实已有 cutover head 的覆盖范围：移出清单的已迁移空间仍可能具备自动资格。不能声称只影响当前清单；如果不能确认全部具备资格的空间均获准，应保持全局关闭并另行审查逐空间开放方案。每设备始终需要明确同意。

## 真实 iPhone 验收清单

使用合成授权和数据，Safari 与实际使用的 PWA 分别记录版本、操作时间与结果：

1. 桌面/手机先导出各自柜，核对同一空间，通过立即同步明确采用同一整柜，hash/epoch/revision 一致后分别启用。
2. 手机正式保存合成修改，确认先本机落盘后云端确认；桌面回前台获取更新，保留其班级选择、不循环上传。
3. 手机断网保存、后台挂起、强制关闭并重开，修改与待同步内容仍在；联网按原 mutation 重试。后台冻结期间不承诺运行。
4. 两设备离线双改后保留两版并暂停，老师明确选择；草稿、未保存表单与旧 AI 回包不覆盖新柜。
5. 停用/换码/退出隔离排程，新账号须重绑；服务端关闭后下次核对持久暂停，重新开放不自动恢复。

本机 Chromium 320/390px、持久 profile 重开与 SQLite 重启不是此项真机证据，不放宽鉴权或搭新公共隧道绕过。

## 停用与恢复边界

关闭 automatic 及前端入口，设备亲自停用并导出柜。本次修复在下一次状态核对持久暂停；后台/离线设备回前台才会获知。已经发送的 CAS 可能完成，开关不能撤销提交；手动 CAS 仍可用，不以故障退回 KV。

freezing/prepared 可以明确 abort；complete 不能取消迁移，strict 不能退回盲写。关闭 migration、删除清单、前端停用或回滚 UI 均不删除权威 head/epoch/strict。禁止回滚到只会 KV 盲写的 Worker、清空 DO 再导入镜像；后端故障采用保留协议的向前修复。Worker 版本回滚也不恢复储存数据。[Cloudflare 版本与存储边界](https://developers.cloudflare.com/workers/versions-and-deployments/)

## 验证与交付边界

`9a6d98f` 的同 SHA CI 完整：Zhang 143项、Commercial 116项、开启路径各3项，Zhang/Worker 部署成功，线上 Zhang 32个静态文件与产物匹配。见 [Pages CI](https://github.com/Charlie-Hong-smu/seat-manager/actions/runs/36978464991)、[Worker CI](https://github.com/Charlie-Hong-smu/seat-manager/actions/runs/36978465004) 与 `SYNC_MOBILE_INTEGRATION.md`。

本次修复通过设计/lint/typecheck、79文件415项全量覆盖率、Worker61项、开启浏览器各3项、双构建/体积及Commercial生产包检查，保留所有原断言。证据目录为 `output/auto-sync-readiness-2026-10-02/`。准备阶段未在本机重跑关闭开关的完整143/116浏览器，不能将基线结果称为新 SHA 的结果；有限发布仍须通过原工作流中两版完整浏览器及全部必需检查，再核实精确 SHA 的部署结果。

有限发布范围仅为 `syncProtocol.ts`、`syncRuntime.test.ts` 与此文及架构/运营说明；不包含 Commercial 晋升、真实旧写证明签署、测试授权创建、任何空间迁移或替老师启用。
