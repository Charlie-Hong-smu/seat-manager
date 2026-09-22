import { useState } from "react";
import { KeyRound, X } from "lucide-react";

import { changePassword } from "../state/authStorage";

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
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="modal-panel-enter app-modal-panel w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-separator-border flex items-start justify-between">
          <div>
            <div className="text-caption-1-regular text-accent-500 mb-0.5" style={{ fontWeight: 700 }}>账户安全</div>
            <h2 className="text-text-primary flex items-center gap-2" style={{ fontSize: "1.125rem", fontWeight: 800 }}>
              <KeyRound className="w-4 h-4 text-accent-500" />
              修改密码
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary-default">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {[
            ["当前密码", currentPassword, setCurrentPassword, "current-password"],
            ["新密码", nextPassword, setNextPassword, "new-password"],
            ["确认新密码", confirmPassword, setConfirmPassword, "new-password"],
          ].map(([label, value, setter, autoComplete]) => (
            <label key={label as string} className="block">
              <span className="block text-caption-1-regular text-text-secondary mb-1.5" style={{ fontWeight: 700 }}>{label as string}</span>
              <input
                type="password"
                value={value as string}
                onChange={event => {
                  (setter as (next: string) => void)(event.target.value);
                  setMessage("修改后需要重新登录。");
                }}
                autoComplete={autoComplete as string}
                className="w-full px-3 py-2 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
              />
            </label>
          ))}
          <p className="text-body-regular text-accent-600">{message}</p>
        </div>

        <div className="p-4 border-t border-separator-border flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border-button-default text-text-secondary hover:bg-background-secondary-default text-body-regular" style={{ fontWeight: 700 }}>
            取消
          </button>
          <button disabled={busy} className="px-4 py-2 rounded-xl bg-accent-600 text-text-white hover:bg-accent-700 disabled:opacity-60 text-body-regular" style={{ fontWeight: 700 }}>
            保存新密码
          </button>
        </div>
      </form>
    </div>
  );
}
