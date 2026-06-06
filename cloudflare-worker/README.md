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

## Frontend Setup

首次点击“生成 AI 趋势建议”时，页面会要求输入 Worker 接口地址和 AI 使用码。Worker 地址只会保存在浏览器本地，不是密钥。
