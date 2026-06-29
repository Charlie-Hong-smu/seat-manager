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
  "devices": []
}
```

- `licenseId` 只能使用英文字母、数字、`_`、`-`，它决定这位老师的云端空间。
- `status` 设为 `disabled` 可停用这个授权码。
- `expiresAt` 可留空；如果要限时，填 ISO 时间，例如 `2026-08-01T00:00:00.000Z`。
- `maxDevices` 默认 `3`。
- `devices` 会在老师登录时自动写入，超过上限会拒绝新设备。

产品授权登录成功后，云同步数据会按授权空间保存：

- `seat-manager:license:<licenseId>:state`

旧版单人同步 fallback 仍保存到固定 key：

- `seat-manager:single-teacher:state`

它只用于旧同步码路径。给外部试用者使用时，应使用产品授权码路径。

## Endpoints

- `POST /license/auth`
  - body: `{ "productCode": "...", "rememberDays": 30 }`
  - response: `{ "token": "...", "expiresAt": 1780000000000 }`
  - 用途：进入应用前校验产品授权码。AI 功能仍使用单独的 `/auth`。

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

进入页面时，前端会要求老师输入产品授权码；首次点击 AI 分析时，页面会再要求老师输入 AI 使用码。Worker 地址已经内置在前端，DeepSeek API Key 只保存在 Cloudflare Worker Secret 中。

账户菜单中的“云同步”用于手动上传和从云端恢复。首次同步操作会要求输入云同步码，前端只保存临时同步 token，不保存 Worker Secret、KV token 或 Cloudflare 管理 token。

恢复云端数据前，前端会自动导出一份本机 JSON 备份。上传到云端会覆盖 KV 中的云端备份；从云端恢复会覆盖当前浏览器里的业务 state，但不会清除本机登录密码、AI 授权 token、同步授权 token 或 PWA 安装信息。
