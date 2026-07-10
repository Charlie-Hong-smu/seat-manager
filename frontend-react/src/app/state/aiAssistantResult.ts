import type { AiAssistantResponse } from "./aiAssistantService";

export function normalizeAssistantDisplayText(value: string, limit = 4000): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function parseAiAssistantResponse(value: unknown): AiAssistantResponse {
  const data = value && typeof value === "object" ? value as Partial<AiAssistantResponse> : {};
  const message = normalizeAssistantDisplayText(String(data.message || ""));
  if (!message) throw new Error("ai_failed");
  return {
    message,
    disclaimer: normalizeAssistantDisplayText(String(data.disclaimer || "AI 内容仅供教师参考，请结合实际课堂观察判断。"), 220),
    suggestedPrompts: Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts.map((item) => normalizeAssistantDisplayText(String(item), 140)).filter(Boolean).slice(0, 4) : [],
  };
}
