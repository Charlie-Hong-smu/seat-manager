import { useState } from "react";
import { BookOpen, ClipboardCheck, Globe2, GraduationCap, Lightbulb, Lock, LogIn, Medal, Monitor, NotebookPen, Presentation, Sprout } from "lucide-react";

import { APP_NAME } from "../config";
import { authorizeProduct, enterLocalPreviewSession } from "../state/authStorage";
import { Button, Checkbox, Input } from "./ui";

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
      <form onSubmit={handleSubmit} className="surface-enter relative z-10 w-full max-w-[26rem]">
        <section className="rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-background-primary-default px-6 py-8 shadow-[var(--app-shadow-float)] sm:px-8">
          <header className="text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-[var(--app-radius-md)] bg-accent-600 text-text-white">
              <BookOpen className="size-5" />
            </span>
            <h1 className="mt-4 text-title-2-medium text-text-primary">{APP_NAME}</h1>
            <p className="mt-1.5 text-body-regular text-text-secondary">输入产品授权码以继续使用</p>
          </header>

          <div className="mt-7">
            <Input
              name="secret"
              type="password"
              value={secret}
              onChange={value => { setSecret(value); setError(""); }}
              placeholder={placeholder}
              aria-label="产品授权码"
              autoComplete="one-time-code"
              isInvalid={Boolean(error)}
              leadingIcon={Lock}
              hint={error || " "}
            />
          </div>

          <div className="mt-5">
            <Checkbox isSelected={remember} onChange={setRemember}>在这台设备记住授权 30 天</Checkbox>
          </div>

          <Button type="submit" disabled={loading} className="mt-6 w-full">
            <LogIn className="h-4 w-4" />
            {loading ? "正在验证…" : "进入工作台"}
          </Button>

          {canEnterLocalPreview && (
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                if (enterLocalPreviewSession()) onLogin();
              }}
            >
              <Monitor className="h-4 w-4" />
              进入本地预览
            </Button>
          )}
        </section>
      </form>
    </main>
  );
}
