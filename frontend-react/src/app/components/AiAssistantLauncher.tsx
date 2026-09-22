import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { IconButton } from "./ui";

export function AiAssistantLauncher({ open, busy, onOpen }: {
  open: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const label = busy ? "AI 正在生成，打开 AI 助手" : "打开 AI 助手";
  return (
    <IconButton
      id="ai-assistant-launcher"
      data-testid="ai-assistant-launcher"
      label={label}
      size="lg"
      aria-expanded={open}
      aria-controls="ai-assistant-companion"
      aria-hidden={open}
      tabIndex={open ? -1 : undefined}
      onClick={onOpen}
      className={`ai-companion-launcher fixed bottom-3 right-3 z-[65] !h-12 !w-12 rounded-full border border-[var(--app-border)] bg-background-primary-default text-text-primary shadow-[var(--app-shadow-float)] sm:bottom-5 sm:right-5 ${open ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"}`}
    >
      <Sparkles className="h-5 w-5 text-status-ai-500" />
      {busy && <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-status-ai-500 motion-safe:animate-pulse" />}
    </IconButton>
  );
}

// A cold download gets a small delayed status, never a full panel that flashes before entry.
export function AiAssistantLoading({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setVisible(true), 180);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", escape); };
  }, [open, onClose]);
  if (!open || !visible) return null;
  return <div role="status" aria-label="正在打开 AI 助手" className="ai-message-enter fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default p-3 text-caption-1-regular text-text-secondary shadow-[var(--app-shadow-float)]">
    <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />正在打开 AI 助手…
    <IconButton label="取消打开 AI 助手" size="sm" onClick={onClose}><X className="size-4" /></IconButton>
  </div>;
}
