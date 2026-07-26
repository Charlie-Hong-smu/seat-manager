import { readLegacyRootState, writeLegacyRootState } from "./storage";
import type { AppStudent, SeatLayoutV1, StudentId, WorkspaceBook } from "./types";
import {
  exportWholeBook,
  importPreparedWorkspace,
  prepareWorkspaceImport,
  type PreparedWorkspaceImport,
} from "./workspaces";
import { toLocalDateKey } from "./dateKey";

const BACKUP_VERSION = 2;
const COLS = 8;

export interface BackupImportPreview {
  version: number;
  data: Record<string, unknown>;
  workspaceBook?: WorkspaceBook;
  prepared: PreparedWorkspaceImport;
  studentCount: number;
  seatCount: number;
  warning: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidLegacyState(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Array.isArray(value.students) && Array.isArray(value.seatOrder);
}

function formatDateForFilename(date = new Date()): string {
  return toLocalDateKey(date);
}

function formatTimeForFilename(date = new Date()): string {
  return date.toTimeString().slice(0, 5).replace(":", "");
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function getCurrentLegacyState(): Record<string, unknown> {
  const state = readLegacyRootState();
  return isValidLegacyState(state) ? state : { students: [], seatOrder: [] };
}

export function getLastBackupAt(): string {
  const state = readLegacyRootState();
  return isRecord(state) && typeof state.lastBackupAt === "string" ? state.lastBackupAt : "";
}

export function formatBackupTime(value: string): string {
  if (!value) {
    return "从未";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function exportBackupJson(): string {
  const exportedAt = new Date().toISOString();
  const current = getCurrentLegacyState();
  writeLegacyRootState({ ...current, lastBackupAt: exportedAt });
  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
    workspaceBook: exportWholeBook(),
  };
  const filename = `seat_manager_full_backup_${formatDateForFilename()}_${formatTimeForFilename()}.json`;
  downloadFile(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  return exportedAt;
}

export function exportCurrentClassBackupJson(): string {
  const exportedAt = new Date().toISOString();
  const data = { ...getCurrentLegacyState(), lastBackupAt: exportedAt };
  downloadFile(`classroom_backup_${formatDateForFilename()}_${formatTimeForFilename()}.json`, JSON.stringify({ version: 1, exportedAt, data }, null, 2), "application/json;charset=utf-8");
  writeLegacyRootState(data);
  return exportedAt;
}

export function exportPreImportBackup(): void {
  const exportedAt = new Date().toISOString();
  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
    reason: "before-import",
    workspaceBook: exportWholeBook(),
  };
  const filename = `before_import_backup_${formatDateForFilename()}_${formatTimeForFilename()}.json`;
  downloadFile(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

export function exportSeatsCsv(students: AppStudent[], seatOrder: Array<StudentId | null>, layout?: SeatLayoutV1): void {
  const studentById = new Map(students.map(student => [student.id, student]));
  if (layout) {
    const groupById = new Map(layout.groups.map(group => [group.id, group.name]));
    const rows = [["组别", "座位", "学生", "横坐标", "纵坐标"], ...layout.seats.map((seat, index) => [groupById.get(seat.groupId || "") || "未分组", seat.label, seatOrder[index] ? studentById.get(seatOrder[index] as StudentId)?.name || "" : "", String(seat.x), String(seat.y)])];
    const content = `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n")}`;
    downloadFile(`座位表_自定义布局_${formatDateForFilename()}.csv`, content, "text/csv;charset=utf-8");
    return;
  }
  const lines = [
    ["行", ...Array.from({ length: COLS }, (_, index) => `第${index + 1}列`)],
  ];
  const rowCount = seatOrder.length ? Math.ceil(seatOrder.length / COLS) : 0;
  for (let row = 0; row < rowCount; row += 1) {
    const cells = Array.from({ length: COLS }, (_, col) => {
      const studentId = seatOrder[row * COLS + col];
      return studentId ? studentById.get(studentId)?.name || "" : "";
    });
    lines.push([String(row + 1), ...cells]);
  }
  const content = `\ufeff${lines.map(row => row.map(cell => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n")}`;
  downloadFile(`座位表_${formatDateForFilename()}.csv`, content, "text/csv;charset=utf-8");
}

export async function parseBackupFile(file: File): Promise<BackupImportPreview> {
  const parsed = JSON.parse(await file.text()) as unknown;
  const version = isRecord(parsed) && typeof parsed.version === "number" ? parsed.version : 0;
  const candidate = isRecord(parsed) && parsed.workspaceBook !== undefined
    ? parsed.workspaceBook
    : isRecord(parsed) && parsed.data !== undefined
      ? parsed.data
      : parsed;
  let prepared: PreparedWorkspaceImport;
  try {
    prepared = prepareWorkspaceImport(candidate);
  } catch {
    throw new Error("invalid_backup");
  }
  const workspaceBook = prepared.book;
  if (prepared.format === "workspace-book") {
    const current = workspaceBook.slices.find(slice => slice.id === workspaceBook.currentSliceId) || workspaceBook.slices[0];
    const data = isRecord(current?.data) ? current.data : { students: [], seatOrder: [] };
    return { version, data, workspaceBook, prepared, studentCount: workspaceBook.slices.reduce((sum, slice) => sum + (Array.isArray(slice.data?.students) ? slice.data.students.length : 0), 0), seatCount: Array.isArray(data.seatOrder) ? data.seatOrder.length : 0, warning: prepared.warnings.join(" ") };
  }
  const data = workspaceBook.slices[0].data;
  if (!isValidLegacyState(data)) {
    throw new Error("invalid_backup");
  }
  const studentCount = Array.isArray(data.students) ? data.students.length : 0;
  const seatCount = Array.isArray(data.seatOrder) ? data.seatOrder.length : 0;
  return {
    version,
    data,
    prepared,
    studentCount,
    seatCount,
    warning: version && ![1, BACKUP_VERSION].includes(version) ? `备份版本 ${version} 与当前版本 ${BACKUP_VERSION} 不同，仍尝试兼容导入。` : "",
  };
}

export function restoreBackup(preview: BackupImportPreview, options: { skipSafetyBackup?: boolean } = {}): boolean {
  if (!options.skipSafetyBackup) exportPreImportBackup();
  return importPreparedWorkspace(preview.prepared);
}
