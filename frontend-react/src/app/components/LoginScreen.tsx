import { useState } from "react";
import { Lock, BookOpen } from "lucide-react";

interface Props {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("请输入密码");
      return;
    }
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 600);
  }

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
            <h1 className="text-gray-900 mb-1" style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.1 }}>
              小张专用<br />座位管理器
            </h1>
            <p className="text-sm text-gray-400 mt-2">请输入密码后继续使用。</p>
          </div>

          {/* Fields */}
          <div className="space-y-3 mb-5">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1.5 block">密码</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm text-gray-800 focus:border-blue-400 focus:ring-3 focus:ring-blue-100 transition-all"
                />
              </div>
            </label>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-sm text-gray-500">记住我</span>
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
            {loading ? "登录中…" : "登录"}
          </button>

          <p className="text-center text-xs text-gray-300 mt-5">
            提示：任意密码均可进入演示模式
          </p>
        </div>
      </form>
    </div>
  );
}
