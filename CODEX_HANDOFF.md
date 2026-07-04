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

**注意**：如果部署后仍有问题，可能需要：
1. 检查 Netlify 代理是否正常工作（可以用 curl 测试）
2. 检查浏览器控制台的具体错误信息
3. 清除浏览器 localStorage 中的 `seat-manager-ai-worker-url` 键（可能残留旧地址）
