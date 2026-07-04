# Codex 交接文档

## 当前状态（2026-07-04）

### 问题描述
商用版授权码登录问题：
- **不开 VPN**：无法连接 Cloudflare Worker，授权失败
- **加了 Netlify 中转后开 VPN**：仍然进不去，提示"请输入产品授权码"

### Codex 已完成的修改（已提交但未推送）

#### Commit: `4b1660b` - Fix commercial auth: force Netlify proxy + better error messages

修改了 4 个文件：

1. **`frontend-react/src/app/state/workerEndpoint.ts`**
   - 商用版强制使用构建时传入的 `VITE_WORKER_URL`，不再读取 localStorage 残留的旧地址
   - 逻辑：如果是商用版且 `VITE_WORKER_URL` 不是默认值，直接返回构建时的 URL

2. **`frontend-react/src/app/state/authStorage.ts`**
   - 给 `/license/auth` 请求加了 try-catch
   - 网络失败时抛出 `license_network_failed` 而不是通用的 `license_auth_failed`

3. **`frontend-react/src/app/components/LoginScreen.tsx`**
   - 新增 `license_required` 错误提示："请输入产品授权码"
   - 新增 `license_network_failed` 错误提示："授权服务连接失败，请刷新页面或换网络后重试"
   - 兜底错误从"请输入产品授权码"改为"授权服务暂时不可用，请稍后重试"

4. **`frontend-react/public/_headers`** (新文件)
   - 为 Cloudflare Pages 添加缓存控制头
   - 防止旧 JS 包被浏览器缓存导致用户看不到更新

### GitHub Actions 配置

`.github/workflows/cloudflare-commercial.yml:105` 会在构建时使用：

```bash
VITE_EDITION=commercial VITE_BASE=/ VITE_WORKER_URL="${{ vars.COMMERCIAL_WORKER_URL }}" pnpm run build
```

**GitHub 仓库变量已设置**：
```
COMMERCIAL_WORKER_URL=https://seat-manager-worker-proxy.netlify.app/api
```

### Netlify 代理

- **代理文件**：`netlify/functions/worker-proxy.mjs`
- **代理路径**：`/api/:path*`
- **转发目标**：`https://seat-manager-ai.hongchenglin03.workers.dev`
- **允许路径**：`/license/auth`, `/license/unbind-device`, `/sync/*`, `/auth`, `/generate-comment` 等

### 下一步操作

1. ✅ **提交已完成**（commit `4b1660b`）
2. ⏳ **推送到 main** - 因网络问题未能自动推送，需要手动执行：
   ```bash
   git push origin main
   ```
3. ⏳ **等待自动部署**：推送后 GitHub Actions 会自动触发 `cloudflare-commercial.yml`
4. ⏳ **在线测试**：部署完成后访问 `https://seat-manager-commercial.pages.dev/` 测试授权码登录

### 验证要点

部署后需要验证：
1. 商用版前端是否使用 Netlify 代理地址（检查浏览器 Network 面板，授权请求应该发到 `seat-manager-worker-proxy.netlify.app`）
2. 不开 VPN 能否正常授权登录
3. 错误提示是否更清晰（网络失败 vs 授权码错误 vs 设备已满）

### 相关文件位置

- 前端配置：`frontend-react/src/app/config.ts`
- Worker 端点：`frontend-react/src/app/state/workerEndpoint.ts`
- 授权逻辑：`frontend-react/src/app/state/authStorage.ts`
- 登录界面：`frontend-react/src/app/components/LoginScreen.tsx`
- 部署配置：`.github/workflows/cloudflare-commercial.yml`
- Netlify 代理：`netlify/functions/worker-proxy.mjs`

---

## 🔴 真正的根因（2026-07-04 补充，Claude 定位）

**症状**：商用站输入**正确**授权码 → 提示"请输入产品授权码"进不去；输入**错误**授权码 → 提示"授权码不正确"（正常）。

**根因**：不是 CORS，不是授权码，不是 VPN。是 **Netlify 代理转发 gzip 响应时头没剥干净**。

浏览器 Network 面板报错：
```
POST https://seat-manager-worker-proxy.netlify.app/api/license/auth
net::ERR_CONTENT_DECODING_FAILED 200 (OK)
```

链路分析：
- `worker-proxy.mjs` 用 `fetch()` 请求上游 Worker，fetch **自动把 gzip body 解压成明文**
- 但转发时 `new Headers(response.headers)` **原样保留了上游的 `Content-Encoding: gzip`**
- 浏览器收到"声明 gzip 但其实是明文"的响应 → 按 gzip 解压明文失败 → `ERR_CONTENT_DECODING_FAILED` → fetch reject → 前端落到兜底文案

**为什么只有正确码触发**：
- 错误码返回 403，body 极小，Cloudflare 不压缩 → 转发无损 → 浏览器能读 ✓
- 正确码返回 200，body 较大（含 token/licenseId），Cloudflare gzip 压缩 → 触发上述 bug ✗

**修复**：`netlify/functions/worker-proxy.mjs` 转发响应前删掉：
```js
headers.delete("content-encoding");
headers.delete("content-length");
headers.delete("transfer-encoding");
```

**部署方式**：该 Netlify 站点是用 **Netlify CLI 手动部署**（`.netlify/state.json` 有 siteId，未连 Git 自动部署）。修改后必须手动重新部署：
```bash
netlify deploy --prod
```

## 建议的后端加固（尚未做）

Worker 顶层 `fetch()`（`deepseek-ai-worker.js:16`）**没有 try-catch**。任何 handler 抛异常会返回不带 CORS 头的运行时错误页，被浏览器当成 CORS 失败吞掉真实错误。建议包一层 try-catch，异常也返回带 corsHeaders 的 JSON，便于以后排查。

---

**其他排查提示**（如果部署后仍有问题）：
1. 检查 Netlify 代理是否正常工作（curl POST 测试，注意接口要 POST，GET 会返回 405）
2. 检查浏览器控制台的具体错误信息
3. 清除浏览器 localStorage 中的 `seat-manager-ai-worker-url` 键（可能残留旧地址）

---

## 🔴 第二个问题：GitHub 自动部署 5 秒就失败（2026-07-04 补充）

**症状**：push 后收到 GitHub 邮件，`changes` job 5 秒失败，后面三个部署 job 全部跳过 → 前端改动根本没上线，商用站一直是旧版本。

**根因**：`cloudflare-commercial.yml` 的 `changes` job 里用 `git diff` 判断改了哪些目录。当一次 push 含多个 commit 时，浅克隆（`fetch-depth: 2`）里取不到对比基准提交 → `git diff` 报错 → 整个 job 挂掉。

**修复**（两处）：
1. checkout 改 `fetch-depth: 0`（拉全历史）
2. `git diff` 前先用 `git cat-file -e` 检查基准提交是否存在，取不到就直接全量部署，不再让脚本崩溃

**这两个问题是叠加的**：workflow 挂了导致前端没部署 + Netlify 代理 gzip bug，两个都修+部署后才能真正解决登录问题。
