import { useState } from "react";
import { BookOpen, ClipboardCheck, Globe2, GraduationCap, Lightbulb, Lock, LogIn, Medal, Monitor, NotebookPen, Presentation, ShieldCheck, Sprout } from "lucide-react";

import { APP_NAME } from "../config";
import { authorizeProduct, enterLocalPreviewSession } from "../state/authStorage";
import { Button } from "./ui";

interface Props {
  onLogin: () => void;
}

function EducationBackdrop() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
    <div className="login-education-wave login-education-wave-one" />
    <div className="login-education-wave login-education-wave-two" />
    <BookOpen className="login-education-icon left-[3%] top-[7%] h-24 w-24 -rotate-6" />
    <Lightbulb className="login-education-icon left-[17%] top-[5%] h-12 w-12" />
    <Presentation className="login-education-icon left-[3%] top-[25%] h-44 w-44" />
    <GraduationCap className="login-education-icon bottom-[6%] left-[5%] h-28 w-28 -rotate-6" />
    <NotebookPen className="login-education-icon bottom-[6%] left-[24%] h-28 w-28 rotate-6" />
    <Globe2 className="login-education-icon right-[13%] top-[6%] h-24 w-24 rotate-6" />
    <Medal className="login-education-icon right-[5%] top-[8%] h-16 w-16 rotate-6" />
    <Sprout className="login-education-icon right-[12%] top-[30%] h-24 w-24" />
    <ClipboardCheck className="login-education-icon bottom-[22%] right-[8%] h-32 w-32 rotate-6" />
    <NotebookPen className="login-education-icon bottom-[3%] right-[2%] h-36 w-36 -rotate-6" />
  </div>;
}

export function LoginScreen({ onLogin }: Props) {
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLicenseSubmit(submittedSecret: string) {
    try {
      await authorizeProduct(submittedSecret, remember);
      onLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "license_unauthorized") {
        setError("授权码不正确，请检查后重试");
        setSecret("");
      } else if (message === "license_wrong_edition") {
        setError("这个授权码不适用于当前版本，请联系我处理");
        setSecret("");
      } else if (message === "license_device_limit") {
        setError("这个授权码绑定设备已满，请联系我处理");
      } else if (message === "license_expired") {
        setError("这个授权码已到期，请联系管理员续期");
      } else if (message === "license_required") {
        setError("请输入产品授权码");
      } else if (message === "license_network_failed") {
        setError("授权服务连接失败，请刷新页面或换网络后重试");
      } else if (message === "license_auth_failed") {
        setError("授权服务暂时不可用，请稍后重试");
      } else {
        setError("授权服务暂时不可用，请稍后重试");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const submittedSecret = String(form.get("secret") || secret).trim();
    setSecret(submittedSecret);
    if (!submittedSecret) {
      setError("请输入产品授权码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await handleLicenseSubmit(submittedSecret);
    } finally {
      setLoading(false);
    }
  }

  const placeholder = "请输入授权码";
  const canEnterLocalPreview = import.meta.env.DEV
    && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--app-login-background)] p-4 sm:p-6">
      <EducationBackdrop />
      <form onSubmit={handleSubmit} className="surface-enter relative z-10 w-full max-w-[31rem]">
        <section className="overflow-hidden rounded-[var(--app-radius-lg)] border border-white/80 bg-white/95 shadow-[var(--app-shadow-float)] backdrop-blur-sm">
          <header className="px-6 pb-5 pt-7 sm:px-9 sm:pt-8">
            <div className="flex items-center justify-center gap-4 sm:gap-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--app-radius-md)] bg-[var(--app-primary)] text-white shadow-lg shadow-blue-600/20 sm:h-14 sm:w-14">
                <BookOpen className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <h1 className="min-w-0 truncate text-xl font-black tracking-tight text-[var(--app-text)]">{APP_NAME}</h1>
            </div>
          </header>

          <div className="flex items-center gap-4 px-6 sm:px-9">
            <span className="h-px flex-1 bg-[var(--app-border)]" />
            <span className="grid h-8 w-8 place-items-center rounded-full border border-[var(--app-border)] bg-white text-gray-400"><ShieldCheck className="h-4 w-4" /></span>
            <span className="h-px flex-1 bg-[var(--app-border)]" />
          </div>

          <div className="px-6 pb-7 pt-6 sm:px-9 sm:pb-8">
            <label className="block">
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  name="secret"
                  type="password"
                  value={secret}
                  onChange={event => { setSecret(event.target.value); setError(""); }}
                  placeholder={placeholder}
                  aria-label="产品授权码"
                  autoComplete="one-time-code"
                  aria-invalid={Boolean(error)}
                  aria-describedby="license-login-message"
                  className={`h-12 w-full rounded-[var(--app-radius-sm)] border bg-white pl-12 pr-4 text-sm text-[var(--app-text)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-gray-400 focus:ring-2 ${error ? "border-red-300 focus:border-red-400 focus:ring-red-500/10" : "border-gray-200 focus:border-blue-400 focus:ring-blue-500/15"}`}
                />
              </span>
            </label>

            <div id="license-login-message" aria-live="polite" className={`pt-2 ${error ? "min-h-8" : "h-4"}`}>
              {error && <p className="text-xs font-semibold leading-5 text-red-600">{error}</p>}
            </div>

            <label className="mb-5 flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--app-text)]">
              <input
                type="checkbox"
                checked={remember}
                onChange={event => setRemember(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[var(--app-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25"
              />
              <span>在这台设备记住授权 30 天</span>
            </label>

            <Button type="submit" disabled={loading} className="w-full shadow-md shadow-blue-600/10">
              <LogIn className="h-4 w-4" />
              {loading ? "正在验证…" : "进入工作台"}
            </Button>

            {canEnterLocalPreview && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    if (enterLocalPreviewSession()) onLogin();
                  }}
                >
                  <Monitor className="h-4 w-4" />
                  进入本地预览
                </Button>
              </div>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
