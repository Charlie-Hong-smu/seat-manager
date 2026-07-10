import type { AiAssistantContext, AiChatMessage } from "./aiAssistantService";

const AI_CHAT_LIMIT = 20;

export function buildAiAssistantRequestBody(messages: AiChatMessage[], context: AiAssistantContext): string {
  return JSON.stringify({
    messages: messages.slice(-AI_CHAT_LIMIT).map((message) => ({ role: message.role, content: message.content })),
    context,
  });
}
