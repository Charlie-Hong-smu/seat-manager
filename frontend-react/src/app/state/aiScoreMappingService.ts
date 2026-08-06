import { clearAiApiAuth, fetchAiRoute, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";
import { getProductAuthToken } from "./authStorage";
import type { RosterMapping } from "./rosterImport";
import { SUBJECT_ORDER, type ScoreMapping } from "./scoreImport";

export interface AiScoreMappingSuggestion {
  mapping: ScoreMapping;
  note: string;
}

export interface AiRosterMappingSuggestion {
  mapping: RosterMapping;
  note: string;
}

export function hasStoredAiScoreMappingAuth(): boolean {
  return hasStoredAiApiAuth();
}

function safeIndex(value: unknown, maxIndex: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
}

function normalizeMapping(headers: string[], result: {
  nameCol?: unknown;
  studentNoCol?: unknown;
  subjectMappings?: Array<{ subject?: string; scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown }>;
  totalMapping?: { scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown };
}): ScoreMapping {
  const maxIndex = headers.length - 1;
  const knownSubjects = new Set(SUBJECT_ORDER);
  return {
    headers,
    nameCol: safeIndex(result.nameCol, maxIndex),
    studentNoCol: safeIndex(result.studentNoCol, maxIndex),
    subjectMappings: Array.isArray(result.subjectMappings)
      ? result.subjectMappings
          .map(item => ({
            subject: knownSubjects.has(String(item.subject)) ? String(item.subject) : "",
            scoreCol: safeIndex(item.scoreCol, maxIndex),
            rankClassCol: safeIndex(item.rankClassCol, maxIndex),
            rankSchoolCol: safeIndex(item.rankSchoolCol, maxIndex),
          }))
          .filter(item => item.subject && item.scoreCol !== -1)
      : [],
    totalMapping: {
      scoreCol: safeIndex(result.totalMapping?.scoreCol, maxIndex),
      rankClassCol: safeIndex(result.totalMapping?.rankClassCol, maxIndex),
      rankSchoolCol: safeIndex(result.totalMapping?.rankSchoolCol, maxIndex),
    },
    warnings: [],
  };
}

function normalizeRosterMapping(headers: string[], result: {
  nameCol?: unknown;
  studentNoCol?: unknown;
  genderCol?: unknown;
  rowCol?: unknown;
  colCol?: unknown;
  hasHeader?: unknown;
}): RosterMapping {
  const maxIndex = headers.length - 1;
  const nameCol = safeIndex(result.nameCol, maxIndex);
  return {
    headers,
    nameCol,
    studentNoCol: safeIndex(result.studentNoCol, maxIndex),
    genderCol: safeIndex(result.genderCol, maxIndex),
    rowCol: safeIndex(result.rowCol, maxIndex),
    colCol: safeIndex(result.colCol, maxIndex),
    hasHeader: result.hasHeader !== false,
    warnings: nameCol === -1 ? ["未识别到姓名列。"] : [],
  };
}

function compactRowsForAi(rows: string[][]): string[][] {
  return rows
    .slice(1, 81)
    .map(row => row.map(cell => String(cell ?? "").trim().slice(0, 80)));
}

export async function suggestScoreMappingWithAi(
  rows: string[][],
  input?: { accessCode?: string; remember?: boolean },
): Promise<AiScoreMappingSuggestion> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const headers = rows[0]?.map(cell => String(cell || "").trim()) || [];
  if (!headers.length) {
    throw new Error("ai_mapping_empty");
  }
  const auth = await getAiAuth(input);
  const requestBody = JSON.stringify({
    headers,
    sampleRows: compactRowsForAi(rows),
    knownSubjects: SUBJECT_ORDER,
  });
  const send = () => fetchAiRoute("/suggest-score-mapping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: requestBody,
  });
  const response = await send();
  if (response.status === 401) {
    if (!getProductAuthToken()) {
      clearAiApiAuth();
    }
    throw new Error("ai_unauthorized");
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
  const data = await response.json() as {
    nameCol?: unknown;
    subjectMappings?: Array<{ subject?: string; scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown }>;
    totalMapping?: { scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown };
    note?: string;
  };
  const mapping = normalizeMapping(headers, data);
  if (mapping.nameCol === -1 || mapping.subjectMappings.length === 0) {
    throw new Error("ai_mapping_failed");
  }
  return {
    mapping,
    note: String(data.note || "AI 已生成列识别建议，请确认后应用。"),
  };
}

export async function suggestRosterMappingWithAi(
  rows: string[][],
  input?: { accessCode?: string; remember?: boolean },
): Promise<AiRosterMappingSuggestion> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const headers = rows[0]?.map(cell => String(cell || "").trim()) || [];
  if (!headers.length) {
    throw new Error("ai_mapping_empty");
  }
  const auth = await getAiAuth(input);
  const requestBody = JSON.stringify({
    headers,
    sampleRows: compactRowsForAi(rows),
  });
  const send = () => fetchAiRoute("/suggest-roster-mapping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: requestBody,
  });
  const response = await send();
  if (response.status === 401) {
    if (!getProductAuthToken()) {
      clearAiApiAuth();
    }
    throw new Error("ai_unauthorized");
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
  const data = await response.json() as {
    nameCol?: unknown;
    studentNoCol?: unknown;
    genderCol?: unknown;
    rowCol?: unknown;
    colCol?: unknown;
    hasHeader?: unknown;
    note?: string;
  };
  const mapping = normalizeRosterMapping(headers, data);
  if (mapping.nameCol === -1) {
    throw new Error("ai_mapping_failed");
  }
  return {
    mapping,
    note: String(data.note || "AI 已生成名单列识别建议，请确认后应用。"),
  };
}
