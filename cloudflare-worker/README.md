# Seat Manager Cloudflare Worker

这个 Worker 用于给静态网页中转 DeepSeek API 请求，并提供第一版手动云同步。不要把 DeepSeek API Key、同步码、KV 管理 token 写进前端或提交到 GitHub。

## Secrets

在 Cloudflare Workers 中配置这些变量：

- `DEEPSEEK_API_KEY`: DeepSeek 平台创建的 API Key。
- `AI_ACCESS_CODE_HASH`: AI 使用码的 SHA-256 hex。
- `TOKEN_SECRET`: 用于签发临时 token 的随机长字符串。
- `SYNC_ACCESS_CODE`: 云同步码，给老师手动输入。也可以改用 `SYNC_ACCESS_CODE_HASH`。
- `SYNC_ACCESS_CODE_HASH`: 可选，云同步码的 SHA-256 hex。配置后优先使用 hash 校验。
- `SYNC_TOKEN_SECRET`: 用于签发同步 token 的随机长字符串，建议和 `TOKEN_SECRET` 不同。
- `ALLOWED_ORIGIN`: 可选，前端网页来源，默认 `https://charlie-hong-smu.github.io`。多个来源可用英文逗号分隔。

生成 `AI_ACCESS_CODE_HASH` 的一种方式：

```bash
printf '你的AI使用码' | shasum -a 256
```

`TOKEN_SECRET` 可以使用一段 32 位以上的随机字符串。

生成 `SYNC_ACCESS_CODE_HASH` 的方式相同：

```bash
printf '你的云同步码' | shasum -a 256
```

## Cloudflare KV

需要创建一个 KV namespace，并在 Worker 中绑定为：

- `SEAT_MANAGER_KV`

同步数据保存到固定 key：

- `seat-manager:single-teacher:state`

第一版只保存单老师的一份完整业务状态，不做多账号、不做自动合并。

## Endpoints

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

首次点击 AI 分析时，页面只要求老师输入 AI 使用码。Worker 地址已经内置在前端，DeepSeek API Key 只保存在 Cloudflare Worker Secret 中。

账户菜单中的“云同步”用于手动上传和从云端恢复。首次同步操作会要求输入云同步码，前端只保存临时同步 token，不保存 Worker Secret、KV token 或 Cloudflare 管理 token。

恢复云端数据前，前端会自动导出一份本机 JSON 备份。上传到云端会覆盖 KV 中的云端备份；从云端恢复会覆盖当前浏览器里的业务 state，但不会清除本机登录密码、AI 授权 token、同步授权 token 或 PWA 安装信息。
