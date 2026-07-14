import type { TermSeason, WorkspaceBook, WorkspaceSlice, WorkspaceTerm } from "./types";

export interface WorkspaceValidationIssue {
  path: string;
  message: string;
}

export type WorkspaceValidationResult =
  | { ok: true; book: WorkspaceBook; warnings: string[] }
  | { ok: false; issues: WorkspaceValidationIssue[] };

export type LegacyValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; issues: WorkspaceValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validateTerm(value: unknown, path: string, issues: WorkspaceValidationIssue[]): value is WorkspaceTerm {
  if (!isRecord(value)) {
    issues.push({ path, message: "学期信息缺失或格式错误" });
    return false;
  }
  const seasons: TermSeason[] = ["spring", "autumn", "custom"];
  if (!validString(value.id)) issues.push({ path: `${path}.id`, message: "学期 ID 不能为空" });
  if (typeof value.year !== "number" || !Number.isFinite(value.year)) issues.push({ path: `${path}.year`, message: "学年必须是有效数字" });
  if (!seasons.includes(value.season as TermSeason)) issues.push({ path: `${path}.season`, message: "学期季节无效" });
  if (!validString(value.label)) issues.push({ path: `${path}.label`, message: "学期名称不能为空" });
  if (!validString(value.createdAt)) issues.push({ path: `${path}.createdAt`, message: "学期创建时间缺失" });
  return issues.every(issue => !issue.path.startsWith(path));
}

function validateSlice(value: unknown, index: number, issues: WorkspaceValidationIssue[]): value is WorkspaceSlice {
  const path = `slices[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path, message: "工作区切片格式错误" });
    return false;
  }
  if (!validString(value.id)) issues.push({ path: `${path}.id`, message: "切片 ID 不能为空" });
  if (!validString(value.classId)) issues.push({ path: `${path}.classId`, message: "班级 ID 不能为空" });
  if (typeof value.className !== "string") issues.push({ path: `${path}.className`, message: "班级名称格式错误" });
  validateTerm(value.term, `${path}.term`, issues);
  if (!validString(value.createdAt)) issues.push({ path: `${path}.createdAt`, message: "切片创建时间缺失" });
  if (!validString(value.updatedAt)) issues.push({ path: `${path}.updatedAt`, message: "切片更新时间缺失" });
  if (!isRecord(value.data)) {
    issues.push({ path: `${path}.data`, message: "班级数据缺失或格式错误" });
  } else {
    if (!Array.isArray(value.data.students)) issues.push({ path: `${path}.data.students`, message: "学生列表必须是数组" });
    if (!Array.isArray(value.data.seatOrder)) issues.push({ path: `${path}.data.seatOrder`, message: "座位列表必须是数组" });
  }
  return issues.every(issue => !issue.path.startsWith(path));
}

export function validateWorkspaceBook(value: unknown): WorkspaceValidationResult {
  const issues: WorkspaceValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "root", message: "备份根节点必须是对象" }] };
  if (value.version !== 1) issues.push({ path: "version", message: "工作区版本必须为 1" });
  if (!Array.isArray(value.slices) || value.slices.length === 0) {
    issues.push({ path: "slices", message: "至少需要一个班级学期切片" });
    return { ok: false, issues };
  }
  value.slices.forEach((slice, index) => validateSlice(slice, index, issues));
  const sliceIds = value.slices.filter(isRecord).map(slice => slice.id).filter(validString);
  if (new Set(sliceIds).size !== sliceIds.length) issues.push({ path: "slices", message: "切片 ID 不能重复" });
  const termIds = value.slices.filter(isRecord).map(slice => isRecord(slice.term) ? slice.term.id : undefined).filter(validString);
  if (new Set(termIds).size !== termIds.length) issues.push({ path: "slices[].term.id", message: "学期 ID 不能重复" });
  if (issues.length) return { ok: false, issues };

  const source = value as unknown as WorkspaceBook;
  const warnings: string[] = [];
  let currentSliceId = source.currentSliceId;
  if (!validString(currentSliceId) || !source.slices.some(slice => slice.id === currentSliceId)) {
    currentSliceId = source.slices[0].id;
    warnings.push("当前工作区引用已失效，已切换到第一个可用工作区。 ");
  }
  return { ok: true, book: { ...source, currentSliceId, slices: [...source.slices] }, warnings };
}

export function validateLegacyWorkspaceData(value: unknown): LegacyValidationResult {
  if (!isRecord(value)) return { ok: false, issues: [{ path: "root", message: "班级数据必须是对象" }] };
  const issues: WorkspaceValidationIssue[] = [];
  if (!Array.isArray(value.students)) issues.push({ path: "students", message: "学生列表必须是数组" });
  if (!Array.isArray(value.seatOrder)) issues.push({ path: "seatOrder", message: "座位列表必须是数组" });
  return issues.length ? { ok: false, issues } : { ok: true, data: value };
}
