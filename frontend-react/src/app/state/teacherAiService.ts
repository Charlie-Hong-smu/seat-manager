import { fetchAiRoute, getAiAuth } from "./aiApiClient";
import { digestFacts } from "./teacherWorkbench";

const CACHE_KEY = "seat-manager-teacher-workbench-ai-v1";

function readCache(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}

function writeCache(cache: Record<string, unknown>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cache is optional */ }
}

async function post<T>(path: string, payload: unknown, validate: (value: unknown) => T): Promise<T> {
  const signature = `${path}:${digestFacts(payload)}`;
  const cached = readCache()[signature];
  if (cached) return validate(cached);
  const auth = await getAiAuth();
  const response = await fetchAiRoute(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` }, body: JSON.stringify(payload) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "ai_unavailable");
  }
  const result = validate(await response.json());
  writeCache({ ...readCache(), [signature]: result });
  return result;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ai_invalid_response");
  return value as Record<string, unknown>;
}

export type AiWeeklyDraftResult = { title: string; content: string; highlights: string[]; cautions: string[]; disclaimer: string };

export function generateAiWeeklyDraft(payload: { scope: "class" | "student"; subjectName: string; startDate: string; endDate: string; facts: string[]; localDraft: string }): Promise<AiWeeklyDraftResult> {
  return post("/generate-weekly-draft", payload, value => {
    const item = asObject(value);
    const list = (input: unknown) => Array.isArray(input) ? input.map(String).map(text => text.trim()).filter(Boolean).slice(0, 6) : [];
    const content = String(item.content || "").trim();
    if (!content) throw new Error("ai_invalid_response");
    return { title: String(item.title || "周报").trim(), content, highlights: list(item.highlights), cautions: list(item.cautions), disclaimer: String(item.disclaimer || "AI 内容仅供教师确认后使用。").trim() };
  });
}

export type AiItemAnalysisResult = { overview: string; weakPoints: string[]; teachingSuggestions: string[]; followupCandidates: Array<{ studentId: string; reason: string }>; disclaimer: string };

export function generateAiItemAnalysis(payload: unknown): Promise<AiItemAnalysisResult> {
  return post("/analyze-score-items", payload, value => {
    const item = asObject(value);
    const list = (input: unknown) => Array.isArray(input) ? input.map(String).map(text => text.trim()).filter(Boolean).slice(0, 8) : [];
    const overview = String(item.overview || "").trim();
    if (!overview) throw new Error("ai_invalid_response");
    const followupCandidates = Array.isArray(item.followupCandidates) ? item.followupCandidates.flatMap(candidate => { const data = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {}; const studentId = String(data.studentId || "").trim(); return studentId ? [{ studentId, reason: String(data.reason || "题目分析建议跟进").trim() }] : []; }).slice(0, 12) : [];
    return { overview, weakPoints: list(item.weakPoints), teachingSuggestions: list(item.teachingSuggestions), followupCandidates, disclaimer: String(item.disclaimer || "AI 分析仅供教师参考。").trim() };
  });
}
