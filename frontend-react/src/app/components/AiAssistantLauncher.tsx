import { Loader2, Sparkles } from "lucide-react";

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
      className={`ai-companion-launcher ai-companion-primary-action fixed bottom-3 right-3 z-[65] !h-12 !w-12 shadow-[var(--app-shadow-float)] sm:bottom-5 sm:right-5 ${open ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"}`}
    >
      {busy
        ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        : <Sparkles className="h-5 w-5" />}
    </IconButton>
  );
}
