import { useState } from "react";
import { Lock, BookOpen } from "lucide-react";

import { IS_COMMERCIAL, APP_NAME } from "../config";
import { authorizeProduct, hasLoginPassword, setAuthenticated, setupPassword, verifyPassword } from "../state/authStorage";

interface Props {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: Props) {
  // 小张版:首次使用进入设置密码模式;商用版始终用授权码。
  const [setupMode] = useState(() => !IS_COMMERCIAL && !hasLoginPassword());
  const [secret, setSecret] = useState("");
  const [confirmSecret, setConfirmSecret] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCommercialSubmit() {
    try {
      await authorizeProduct(secret, remember);
      onLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "license_unauthorized") {
        setError("授权码不正确，请检查后重试");
        setSecret("");
      } else if (message === "license_device_limit") {
        setError("这个授权码绑定设备已满，请联系我处理");
      } else if (message === "license_auth_failed") {
        setError("授权服务暂时不可用，请稍后重试");
      } else {
        setError("请输入产品授权码");
      }
    }
  }

  async function handleLocalSubmit() {
    if (setupMode && secret.length < 4) {
      setError("密码至少需要 4 位");
      return;
    }
    if (setupMode && secret !== confirmSecret) {
      setError("两次输入的密码不一致");
      return;
    }
    if (setupMode) {
      await setupPassword(secret);
      setAuthenticated(remember);
      onLogin();
      return;
    }
    if (await verifyPassword(secret)) {
      setAuthenticated(remember);
      onLogin();
      return;
    }
    setError("密码不正确，请重试");
    setSecret("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) {
      setError(IS_COMMERCIAL ? "请输入产品授权码" : "请输入密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (IS_COMMERCIAL) {
        await handleCommercialSubmit();
      } else {
        await handleLocalSubmit();
      }
    } finally {
      setLoading(false);
    }
  }

  const fieldLabel = IS_COMMERCIAL ? "产品授权码" : "密码";
  const placeholder = IS_COMMERCIAL ? "请输入授权码" : setupMode ? "请设置密码" : "请输入密码";
  const subtitle = IS_COMMERCIAL
    ? "请输入产品授权码后继续使用。"
    : setupMode
    ? "首次使用请设置本机登录密码。"
    : "请输入密码后继续使用。";

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #f5f5f7 50%, #f0f7f0 100%)" }}>
      {/* Decorative blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />
      </div>

      <form onSubmit={handleSubmit} className="relative w-full max-w-sm">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-9 shadow-2xl border border-white/60">
          {/* Brand */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs text-gray-400 tracking-widest uppercase">Seat Manager</span>
            </div>
            <h1 className="text-gray-900 mb-1" style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.15 }}>
              {APP_NAME}
            </h1>
            <p className="text-sm text-gray-400 mt-2">{subtitle}</p>
          </div>

          {/* Fields */}
          <div className="space-y-3 mb-5">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1.5 block">{fieldLabel}</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={secret}
                  onChange={e => { setSecret(e.target.value); setError(""); }}
                  placeholder={placeholder}
                  autoComplete={IS_COMMERCIAL ? "one-time-code" : setupMode ? "new-password" : "current-password"}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400 focus:ring-3 focus:ring-blue-100 transition-all"
                />
              </div>
            </label>
            {setupMode && (
              <label className="block">
                <span className="text-xs text-gray-500 mb-1.5 block">确认密码</span>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={confirmSecret}
                    onChange={e => { setConfirmSecret(e.target.value); setError(""); }}
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400 focus:ring-3 focus:ring-blue-100 transition-all"
                  />
                </div>
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={event => setRemember(event.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-gray-500">{IS_COMMERCIAL ? "记住授权 30 天" : "记住我"}</span>
          </label>

          {error && (
            <p className="text-sm text-red-500 mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors disabled:opacity-60"
            style={{ fontWeight: 600 }}
          >
            {loading ? (IS_COMMERCIAL ? "验证中…" : "登录中…") : IS_COMMERCIAL ? "进入" : "登录"}
          </button>

          <p className="text-center text-xs text-gray-300 mt-5">
            {IS_COMMERCIAL ? "授权码会绑定本机设备名额" : "密码只保存在当前浏览器本地"}
          </p>
        </div>
      </form>
    </div>
  );
}
