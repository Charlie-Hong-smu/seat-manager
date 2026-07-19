import { getProductAuthToken } from "./authStorage";
import { fetchAiRoute, getAiAuth } from "./aiApiClient";

const AI_REFINEMENT_REQUEST_LIMIT_BYTES = 8 * 1024;

export type CommentRefinementAction = "polish" | "specific" | "shorten";

export const COMMENT_REFINEMENT_ACTIONS: ReadonlyArray<{ value: CommentRefinementAction; label: string }> = [
  { value: "polish", label: "优化表达" },
  { value: "specific", label: "更具体" },
  { value: "shorten", label: "缩短" },
];

interface CommentRefinementInput {
  studentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  action: CommentRefinementAction;
  accessCode?: string;
  remember?: boolean;
}

export interface CommentRefinementResult {
  replacement: string;
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REFINEMENT_REQUEST_LIMIT_BYTES;
}

export function replaceCommentSelection(text: string, start: number, end: number, replacement: string): string {
  if (start < 0 || end < start || end > text.length) return text;
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

export async function refineCommentSelection(input: CommentRefinementInput): Promise<CommentRefinementResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }

  const payload = {
    studentId: input.studentId,
    action: input.action,
    selectedText: input.selectedText.trim(),
    contextBefore: input.contextBefore.slice(-600),
    contextAfter: input.contextAfter.slice(0, 600),
  };
  if (!payload.selectedText || !validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }

  const send = async (token: string) => fetchAiRoute("/refine-comment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAiAuth({ accessCode: input.accessCode, remember: input.remember });
  let response = await send(auth.token);
  if (response.status === 401) {
    if (getProductAuthToken()) throw new Error("ai_unauthorized");
    auth = await getAiAuth({ accessCode: input.accessCode, remember: input.remember });
    response = await send(auth.token);
  }
  if (response.status === 403) throw new Error("ai_unauthorized");
  if (response.status === 429) throw new Error("ai_rate_limited");
  if (!response.ok) throw new Error("ai_failed");

  const data = await response.json() as Partial<CommentRefinementResult>;
  const replacement = String(data.replacement || "").trim();
  if (!replacement) throw new Error("ai_failed");
  return { replacement };
}
