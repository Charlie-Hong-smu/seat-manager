# Seat Manager Cloudflare Worker

这个 Worker 用于给静态网页中转 DeepSeek API 请求，并提供第一版手动云同步。不要把 DeepSeek API Key、同步码、KV 管理 token 写进前端或提交到 GitHub。

## Secrets

在 Cloudflare Workers 中配置这些变量：

- `DEEPSEEK_API_KEY`: DeepSeek 平台创建的 API Key。
- `PRODUCT_ACCESS_CODE_HASH`: 单码 fallback，产品授权码的 SHA-256 hex，用于进入应用前验证。
- `PRODUCT_ACCESS_CODE`: 产品授权码明文。更推荐使用 `PRODUCT_ACCESS_CODE_HASH`。
- `PRODUCT_TOKEN_SECRET`: 用于签发产品授权 token 的随机长字符串。未配置时会回退使用 `TOKEN_SECRET`。
- `PRODUCT_LICENSE_ID`: 单码 fallback 对应的空间 ID，默认 `single`。
- `PRODUCT_MAX_DEVICES`: 单码 fallback 最多绑定设备数，默认 `3`。
- `AI_ACCESS_CODE_HASH`: AI 使用码的 SHA-256 hex。
- `TOKEN_SECRET`: 用于签发临时 token 的随机长字符串。
- `SYNC_ACCESS_CODE`: 云同步码，给老师手动输入。也可以改用 `SYNC_ACCESS_CODE_HASH`。
- `SYNC_ACCESS_CODE_HASH`: 可选，云同步码的 SHA-256 hex。配置后优先使用 hash 校验。
- `SYNC_TOKEN_SECRET`: 用于签发同步 token 的随机长字符串，建议和 `TOKEN_SECRET` 不同。
- `ALLOWED_ORIGIN`: 可选，前端网页来源，默认 `https://charlie-hong-smu.github.io`。多个来源可用英文逗号分隔。

生成 `PRODUCT_ACCESS_CODE_HASH` 或 `AI_ACCESS_CODE_HASH` 的一种方式：

```bash
printf '你的授权码' | shasum -a 256
```

`TOKEN_SECRET` 可以使用一段 32 位以上的随机字符串。

生成 `SYNC_ACCESS_CODE_HASH` 的方式相同：

```bash
printf '你的云同步码' | shasum -a 256
```

## Wrangler 本地部署

本目录已配置 Wrangler，用于以后从本地部署 Worker，避免每次到 Cloudflare 网页后台手动粘贴代码。

首次使用：

```bash
cd cloudflare-worker
npm install
npm exec wrangler -- login
```

常用命令：

```bash
npm run deploy      # 部署 deepseek-ai-worker.js 到 seat-manager-ai
npm run dev         # 本地开发预览
npm run tail        # 查看线上实时日志
```

`wrangler.toml` 只记录 Worker 名称、入口文件和 KV 绑定，不保存任何密钥。`DEEPSEEK_API_KEY`、`TOKEN_SECRET`、`AI_ACCESS_CODE_HASH`、`PRODUCT_TOKEN_SECRET` 等仍应保存在 Cloudflare Worker 的 Secrets / Variables 中。

如果要通过命令设置 secret，可用：

```bash
npm exec wrangler -- secret put SECRET_NAME
```

不要把 `.dev.vars`、API Key、授权码明文或同步码提交进 Git。

## Cloudflare Pages 商用试用站

商用试用站项目：

- Project name: `seat-manager-commercial`
- Stable URL: `https://seat-manager-commercial.pages.dev/`

重新部署商用前端：

```bash
cd ../frontend-react
VITE_EDITION=commercial VITE_BASE=/ npm run build
../cloudflare-worker/node_modules/.bin/wrangler pages deploy dist --project-name seat-manager-commercial --branch main --commit-dirty true
```

Worker 的 `ALLOWED_ORIGIN` 已在 `wrangler.toml` 中保留小张 GitHub Pages，并追加商用 Pages 域名。后续如果换商用域名，需要把新域名追加到 `ALLOWED_ORIGIN` 后重新 `npm run deploy`。

## Cloudflare KV

需要创建一个 KV namespace，并在 Worker 中绑定为：

- `SEAT_MANAGER_KV`

小范围试用时，每个授权码对应一条 KV 授权记录。先计算授权码 hash：

```bash
printf '给某位老师的授权码' | shasum -a 256
```

然后在 `SEAT_MANAGER_KV` 里新增 key：

```text
seat-manager:license:<上一步得到的hash>
```

value 示例：

```json
{
  "licenseId": "teacher-a",
  "status": "active",
  "expiresAt": "",
  "maxDevices": 3,
  "aiEnabled": true,
  "aiExpiresAt": "",
  "aiDailyLimit": 30,
  "devices": []
}
```

- `licenseId` 只能使用英文字母、数字、`_`、`-`，它决定这位老师的云端空间。
- `status` 设为 `disabled` 可停用这个授权码。
- `expiresAt` 可留空；如果要限时，填 ISO 时间，例如 `2026-08-01T00:00:00.000Z`。
- `maxDevices` 默认 `3`。
- `aiEnabled` 控制这个授权码是否包含 AI 权益。
- `aiExpiresAt` 控制 AI 到期时间，可和 `expiresAt` 不同；留空表示 AI 不单独到期。
- `aiDailyLimit` 控制该授权码每天最多 AI 请求次数，默认 `30`。
- `devices` 会在老师登录时自动写入，超过上限会拒绝新设备；商用版账号菜单里的“解绑本机”会释放当前设备名额。

产品授权登录成功后，云同步数据会按授权空间保存：

- `seat-manager:license:<licenseId>:state`

旧版单人同步 fallback 仍保存到固定 key：

- `seat-manager:single-teacher:state`

它只用于旧同步码路径。给外部试用者使用时，应使用产品授权码路径。

## License Admin

仓库里的 `license-admin/index.html` 是轻量授权管理页，用于你自己管理人员和授权记录。它不会打包进老师使用的前端；已部署的固定地址是 `https://seat-manager-license-admin.pages.dev/`。

首次使用前，先给 Worker 设置管理员密钥：

```bash
cd cloudflare-worker
openssl rand -base64 24
npm exec wrangler -- secret put LICENSE_ADMIN_TOKEN
npm run deploy
```

把 `openssl rand` 生成的密钥保存到自己的密码管理器；`wrangler secret put` 提示输入时粘贴这串密钥。管理页打开后填写 Worker 地址和管理员密钥即可操作。

管理页支持：

- 新增授权码：生成随机授权码，自动写入对应 KV 记录。
- 修改授权：调整 `status`、软件到期日、AI 是否开通、AI 到期日、AI 每日次数、设备上限。
- 清空设备：释放某个授权码当前绑定的所有设备。
- 删除授权：删除授权记录；默认不删除该老师的云端业务数据。

## Endpoints

- `POST /license/auth`
  - body: `{ "productCode": "...", "rememberDays": 30, "deviceId": "...", "deviceName": "..." }`
  - response: `{ "token": "...", "expiresAt": 1780000000000, "licenseId": "...", "maxDevices": 3, "aiEnabled": true }`
  - 用途：进入应用前校验产品授权码、绑定当前设备；商用版 AI 可复用同一个产品授权 token。

- `POST /license/unbind-device`
  - header: `Authorization: Bearer <product_token>`
  - response: `{ "ok": true, "removed": true, "licenseId": "...", "maxDevices": 3 }`
  - 用途：商用版账号菜单“解绑本机”，从当前授权码的 `devices` 中移除本机并释放设备名额。

- `POST /admin/licenses/list`
- `POST /admin/licenses/upsert`
- `POST /admin/licenses/clear-devices`
- `POST /admin/licenses/delete`
  - header: `Authorization: Bearer <LICENSE_ADMIN_TOKEN>`
  - 用途：仅供 `license-admin/index.html` 管理页使用。

- `POST /auth`
  - body: `{ "accessCode": "...", "rememberDays": 30 }`
  - response: `{ "token": "...", "expiresAt": 1780000000000 }`

- `POST /analyze-trend`
  - header: `Authorization: Bearer <token>`
  - body: 当前学生的匿名成绩摘要
  - response: `{ "overall": "...", "changes": "...", "suggestions": "...", "disclaimer": "..." }`

- `POST /analyze-class`
  - header: `Authorization: Bearer <token>`
  - body: 全班成绩变化摘要，包含学生姓名，方便直接生成可读的关注名单
  - response: `{ "overall": "...", "classChanges": "...", "focusStudents": "...", "suggestions": "...", "disclaimer": "..." }`

- `POST /suggest-score-mapping`
  - header: `Authorization: Bearer <token>`
  - body: 成绩表表头和少量样例行
  - response: `{ "nameCol": 0, "subjectMappings": [...], "totalMapping": {...}, "note": "..." }`

- `POST /sync/auth`
  - body: `{ "syncCode": "...", "rememberDays": 30 }`
  - response: `{ "token": "...", "expiresAt": 1780000000000 }`

- `GET /sync/status`
  - header: `Authorization: Bearer <sync_token>`
  - response: `{ "exists": true, "updatedAt": "...", "deviceName": "...", "version": 1, "sizeBytes": 123456 }`

- `POST /sync/save`
  - header: `Authorization: Bearer <sync_token>`
  - body: `{ "version": 1, "updatedAt": "...", "deviceName": "...", "data": { ...完整 state... } }`
  - 行为：用本机完整业务 state 覆盖 KV 中的云端备份。

- `GET /sync/load`
  - header: `Authorization: Bearer <sync_token>`
  - response: `{ "version": 1, "updatedAt": "...", "deviceName": "...", "data": { ...完整 state... } }`

## Frontend Setup

进入页面时，前端会要求老师输入产品授权码。商用版如果 license 记录包含 `aiEnabled: true` 且 AI 未到期，AI 分析和 AI 评语会直接复用产品授权码；小张版和旧路径仍可使用独立 AI 使用码。Worker 地址已经内置在前端，DeepSeek API Key 只保存在 Cloudflare Worker Secret 中。

账户菜单中的“云同步”用于手动上传和从云端恢复。首次同步操作会要求输入云同步码，前端只保存临时同步 token，不保存 Worker Secret、KV token 或 Cloudflare 管理 token。

恢复云端数据前，前端会自动导出一份本机 JSON 备份。上传到云端会覆盖 KV 中的云端备份；从云端恢复会覆盖当前浏览器里的业务 state，但不会清除本机登录密码、AI 授权 token、同步授权 token 或 PWA 安装信息。
