import { describe, expect, it } from "vitest";
import { normalizeAssistantDisplayText, parseAiAssistantResponse } from "./aiAssistantResult";
import { buildAiAssistantRequestBody } from "./aiAssistantPayload";

describe("AI assistant result parser", () => {
  it("normalizes presentation markdown and caps suggestions", () => {
    expect(normalizeAssistantDisplayText("## **建议**\n- 先观察")).toBe("建议\n• 先观察");
    expect(parseAiAssistantResponse({ message: "**结论**", suggestedPrompts: ["1", "2", "3", "4", "5"] })).toMatchObject({ message: "结论", suggestedPrompts: ["1", "2", "3", "4"] });
  });

  it("rejects empty upstream messages", () => {
    expect(() => parseAiAssistantResponse({ message: "  " })).toThrow("ai_failed");
  });

  it("keeps only the latest twenty chat messages in the request payload", () => {
    const messages = Array.from({ length: 22 }, (_, index) => ({ id: String(index), role: "user" as const, content: `m${index}`, createdAt: "now" }));
    const context = { baseContext: { className: "一班", termLabel: "本学期", studentCount: 0, seatCount: 0, examInsights: [], gradeTrend: [], focusStudents: [], tagSummary: [], recordSummary: [], seatSummary: "", dormitorySummary: [], fundSummary: "" }, contextPacks: [] };
    const parsed = JSON.parse(buildAiAssistantRequestBody(messages, context)) as { messages: Array<{ content: string }> };
    expect(parsed.messages).toHaveLength(20);
    expect(parsed.messages[0].content).toBe("m2");
  });
});
