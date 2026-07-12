import { saveStudentCommentDraft } from "./commentStorage";
import { getProductAuthToken } from "./authStorage";
import { clearAiApiAuth, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";
import { buildStudentAiContext, compactStudentContextForToken } from "./aiStudentContext";
import { getWorkerBaseUrl } from "./workerEndpoint";
import type { AppStudent, StudentCommentDraft } from "./types";

const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_COMMENT_CACHE_SCOPE = "student-comment";
const AI_REQUEST_LIMIT_BYTES = 20 * 1024;

interface AiResult {
  comment: string;
  needsMoreInfo?: boolean;
  missingInfo?: string[];
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

export function hasStoredAiAuth(): boolean {
  return hasStoredAiApiAuth();
}

export function clearAiAuth(): void {
  clearAiApiAuth();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function getCacheSignature(payload: unknown): string {
  return `${AI_COMMENT_CACHE_SCOPE}:${stableStringify(payload)}`;
}

function getCachedComment(signature: string): AiResult | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiResult>;
    return cache[signature] || null;
  } catch {
    return null;
  }
}

function storeCachedComment(signature: string, result: AiResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [signature]: result }).slice(-50));
    window.localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache write failures.
  }
}

function lengthInstruction(draft: StudentCommentDraft): string {
  if (draft.lengthMode === "short") return "80 到 100 字";
  if (draft.lengthMode === "long") return "150 到 200 字";
  if (draft.lengthMode === "custom") return `约 ${draft.targetWordCount} 字，允许上下浮动 15 字`;
  return "100 到 150 字";
}

function buildPayload(student: AppStudent, draft: StudentCommentDraft) {
  const context = compactStudentContextForToken(buildStudentAiContext({ student, draft, maxRecords: 8, maxTags: 12 }));

  return {
    studentId: student.id,
    studentName: student.name,
    style: draft.style,
    commentLengthMode: draft.lengthMode,
    targetWordCount: draft.targetWordCount,
    lengthRange: draft.lengthMode === "custom" ? `${draft.targetWordCount} 字左右` : undefined,
    lengthInstruction: lengthInstruction(draft),
    context,
    commentProfile: {
      criteriaSummary: draft.criteriaSummary || [],
      customOptions: draft.customOptions || [],
      teacherNote: draft.teacherNote,
    },
    requirements: {
      length: lengthInstruction(draft),
      useOnlyProvidedFacts: true,
      noFabrication: true,
      naturalLanguage: true,
      constructive: true,
      tone: {
        warm: "温和鼓励",
        formal: "客观正式",
        brief: "简洁家长会风格",
      }[draft.style],
    },
  };
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REQUEST_LIMIT_BYTES;
}

export async function generateStudentAiComment(
  student: AppStudent,
  draft: StudentCommentDraft,
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }

  const payload = buildPayload(student, draft);
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature({ studentId: student.id, payload });
  if (!input?.force) {
    const cached = getCachedComment(signature);
    if (cached?.comment) {
      saveStudentCommentDraft(student.id, { ...draft, generatedComment: cached.comment });
      return cached;
    }
  }

  const send = async (token: string) => fetch(`${getWorkerBaseUrl()}/generate-comment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAiAuth(input);
  let response = await send(auth.token);
  if (response.status === 401) {
    if (getProductAuthToken()) {
      throw new Error("ai_unauthorized");
    }
    clearAiApiAuth();
    auth = await getAiAuth(input);
    response = await send(auth.token);
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    throw new Error("ai_failed");
  }

  const data = await response.json() as AiResult;
  const comment = String(data.comment || "").trim();
  if (!comment) {
    return {
      comment: "",
      needsMoreInfo: true,
      missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo : [],
    };
  }
  const result = {
    comment,
    needsMoreInfo: Boolean(data.needsMoreInfo),
    missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo : [],
  };
  storeCachedComment(signature, result);
  saveStudentCommentDraft(student.id, { ...draft, generatedComment: comment });
  return result;
}
