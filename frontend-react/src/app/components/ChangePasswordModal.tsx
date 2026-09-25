import { useId, useState } from "react";
import { KeyRound } from "lucide-react";

import { changePassword } from "../state/authStorage";
import { Button, InlineStatus, Input, ModalShell } from "./ui";

interface ChangePasswordModalProps {
  onClose: () => void;
  onPasswordChanged: () => void;
}

export function ChangePasswordModal({ onClose, onPasswordChanged }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("修改后需要重新登录。");
  const [busy, setBusy] = useState(false);
  const formId = useId();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (nextPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setBusy(true);
    try {
      const result = await changePassword(currentPassword, nextPassword);
      if (result === "too_short") {
        setMessage("新密码至少需要 4 位。");
        return;
      }
      if (result === "invalid_current") {
        setMessage("当前密码不正确。");
        return;
      }
      onPasswordChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell open title="修改密码" description="账户安全 · 修改后需要重新登录" onClose={onClose} className="max-w-md" footer={<>
      <Button variant="ghost" onClick={onClose}>取消</Button>
      <Button type="submit" form={formId} disabled={busy}><KeyRound className="h-4 w-4" />保存新密码</Button>
    </>}>
      <form id={formId} onSubmit={handleSubmit} className="space-y-3">
        {[
          ["当前密码", currentPassword, setCurrentPassword, "current-password"],
          ["新密码", nextPassword, setNextPassword, "new-password"],
          ["确认新密码", confirmPassword, setConfirmPassword, "new-password"],
        ].map(([label, value, setter, autoComplete]) => (
          <Input key={label as string} label={label as string} type="password" value={value as string} autoComplete={autoComplete as string}
            onChange={next => { (setter as (next: string) => void)(next); setMessage("修改后需要重新登录。"); }} />
        ))}
        <InlineStatus message={message} tone={message === "修改后需要重新登录。" ? "info" : "error"} />
      </form>
    </ModalShell>
  );
}
