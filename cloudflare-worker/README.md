# Seat Manager Cloudflare Worker

本 Worker 负责产品授权、设备名额、手动云同步、AI 请求和授权管理接口。架构链路见 `../docs/ARCHITECTURE.md`，发布与排障见 `../docs/OPERATIONS.md`。

## 代码边界

- `deepseek-ai-worker.js`：稳定的 Wrangler 入口，只导出应用。
- `worker-app.js`：CORS、异常边界、显式路由装配与现有领域 handler。
- `worker-auth.js`：token、hash 和常量时间比较。
- `worker-usage.js`：`AiRequestContext`、短窗口限流和 KV 日计数。
- `routes/`：license、sync 与 AI 的领域路由表；管理员路由仍由应用入口显式装配并受同一鉴权/响应边界保护。
- `worker-router.js`：统一路由调度。
- `worker-response.js`：CORS、JSON 和异常响应。
- `worker-routes.js`：浏览器可调用的公共路由契约。
- `test/routes.test.js`：Worker 与 Netlify 代理路由一致性。
- `test/worker.test.js`：鉴权边界、请求限制和异常响应。

新增或删除公共接口时，必须同时更新 handler 与 `worker-routes.js`，并让路由契约测试通过。不要在 README 中维护另一份容易过期的完整路由清单。

## 本地命令

本目录统一使用 npm：

```bash
npm ci
npm run dev
npm run check
npx wrangler deploy --dry-run
```

获得用户明确部署授权后才运行：

```bash
npm run deploy
```

常用辅助命令：

```bash
npm run tail
npx wrangler secret put SECRET_NAME
```

`wrangler.toml` 只保存非敏感配置和 KV binding。不要提交 `.dev.vars`、API key、授权码、同步码或 token secret。

## Secrets 与变量

- `DEEPSEEK_API_KEY`：DeepSeek API key。
- `PRODUCT_ACCESS_CODE_HASH`：单码 fallback 的产品码 SHA-256。
- `PRODUCT_ACCESS_CODE`：产品码明文 fallback；优先使用 hash。
- `PRODUCT_TOKEN_SECRET`：产品授权 token 签名 secret。
- `PRODUCT_LICENSE_ID`：单码 fallback 空间 ID，默认 `single`。
- `PRODUCT_MAX_DEVICES`：单码 fallback 设备上限，默认 `3`。
- `AI_ACCESS_CODE_HASH`：Zhang/旧路径独立 AI 使用码 hash。
- `TOKEN_SECRET`：独立 AI token 签名 secret。
- `SYNC_ACCESS_CODE` / `SYNC_ACCESS_CODE_HASH`：旧同步码路径。
- `SYNC_TOKEN_SECRET`：同步 token 签名 secret，应与其他 secret 不同。
- `LICENSE_ADMIN_TOKEN`：授权管理页管理员 token。
- `ALLOWED_ORIGIN`：允许的前端 origin，多个值用英文逗号分隔。

计算访问码 hash：

```bash
printf '你的访问码' | shasum -a 256
```

随机 secret 应至少 32 位，并保存在 Cloudflare Secrets 或密码管理器中。

## KV 数据

Worker 绑定的 KV 名称固定为 `SEAT_MANAGER_KV`。

AI 日计数 key（内部防滥用，不进入备份或同步）：

```text
seat-manager:ai-usage:<YYYY-MM-DD>:<actorHash>
```

value 为 `{ "count": number, "updatedAt": string }`，3 天过期。payload 校验成功后、调用 DeepSeek 前计数；KV 故障只记录结构化告警并放行。`AUTH_RATE_LIMITER` 为每来源/登录路由每分钟 20 次，`AI_RATE_LIMITER` 为每个已验证 actor 每分钟 12 次。

产品授权记录 key：

```text
seat-manager:license:<产品码 SHA-256>
```

value 的兼容形状：

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

- `licenseId` 只使用字母、数字、`_` 和 `-`。
- 空 `expiresAt` / `aiExpiresAt` 表示不单独到期。
- `status: "disabled"` 停用授权。
- `devices` 由产品登录和解绑接口维护。

授权空间同步数据：

```text
seat-manager:license:<licenseId>:state
```

旧同步码 fallback 仍使用：

```text
seat-manager:single-teacher:state
```

这些 key 和 value 形状属于兼容接口，不得随意重命名。

## 授权管理页

`../license-admin/index.html` 是独立的管理员页面，固定入口为 <https://seat-manager-license-admin.pages.dev/>。它使用 `LICENSE_ADMIN_TOKEN` 管理授权记录、AI 权益、到期时间和设备绑定，不进入教师前端构建。

管理员 token 只在 Cloudflare Secret 和管理员本人浏览器中使用。删除授权记录默认不删除对应老师的云端业务数据。

## 网络与发布面

- Worker：`seat-manager-ai`。
- Commercial 前端：<https://seat-manager-commercial.pages.dev/>。
- Netlify 代理：`../netlify/functions/worker-proxy.mjs`，生产入口为 <https://seat-manager-worker-proxy.netlify.app/api>。
- Commercial 构建可通过 `VITE_WORKER_URL` 或仓库变量 `COMMERCIAL_WORKER_URL` 指向代理；客户端保留 direct Worker fallback。

Netlify 只代理 `worker-routes.js` 声明的公共应用路由，不代理 `/admin/licenses/*`。公共路由变化后，除了 Worker 和 Commercial 部署，还必须按 `../docs/OPERATIONS.md` 独立发布 Netlify。

## 安全与行为约束

- 顶层异常只返回带 CORS 的结构化错误，不向客户端泄露 secret、token 或堆栈。
- AI 只返回建议；教师确认写入由前端业务流程负责。
- 云同步是完整 workspace book 的手动覆盖，不做实时同步或自动冲突合并。
- 请求体、设备数、授权到期和 AI 权益限制必须继续由 Worker 校验。
