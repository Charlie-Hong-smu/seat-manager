# DeepSeek AI Worker

这个 Worker 用于给静态网页中转 DeepSeek API 请求。不要把 DeepSeek API Key 写进前端或提交到 GitHub。

## Secrets

在 Cloudflare Workers 中配置这些变量：

- `DEEPSEEK_API_KEY`: DeepSeek 平台创建的 API Key。
- `AI_ACCESS_CODE_HASH`: AI 使用码的 SHA-256 hex。
- `TOKEN_SECRET`: 用于签发临时 token 的随机长字符串。
- `ALLOWED_ORIGIN`: 可选，前端网页来源，例如 `https://your-name.github.io`。

生成 `AI_ACCESS_CODE_HASH` 的一种方式：

```bash
printf '你的AI使用码' | shasum -a 256
```

`TOKEN_SECRET` 可以使用一段 32 位以上的随机字符串。

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

## Frontend Setup

首次点击 AI 分析时，页面只要求老师输入 AI 使用码。Worker 地址已经内置在前端，DeepSeek API Key 只保存在 Cloudflare Worker Secret 中。
