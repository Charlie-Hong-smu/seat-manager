import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { GradeExam, GradeRow, GradeScoreCell } from "../state/types";

interface ExamTableModalProps {
  exam: GradeExam;
  onClose: () => void;
}

function formatScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function formatRank(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function getCell(row: GradeRow, subject: string): GradeScoreCell {
  return row.scores[subject] || { score: null, rankClass: null, rankSchool: null };
}

function ScoreValue({ cell }: { cell: GradeScoreCell }) {
  const hasAssigned = typeof cell.assignedScore === "number" && Number.isFinite(cell.assignedScore);
  const hasRaw = typeof cell.rawScore === "number" && Number.isFinite(cell.rawScore);
  return <span className="flex min-h-10 flex-col items-center justify-center px-2 py-1.5 text-text-primary">
    <span className="font-semibold">{formatScore(cell.score)}</span>
    {hasAssigned && hasRaw && <span className="mt-0.5 text-[9px] text-text-tertiary">赋分 · 原 {cell.rawScore}</span>}
    {hasAssigned && !hasRaw && <span className="mt-0.5 text-[9px] text-text-tertiary">赋分</span>}
    {!hasAssigned && hasRaw && <span className="mt-0.5 text-[9px] text-text-tertiary">原始分</span>}
  </span>;
}

export function ExamTableModal({ exam, onClose }: ExamTableModalProps) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return exam.rows;
    }
    return exam.rows.filter(row => row.name.includes(keyword));
  }, [exam.rows, query]);

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-text-primary/35 p-6 backdrop-blur-sm">
      <div className="modal-panel-enter flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default shadow-2xl">
        <div className="shrink-0 px-6 py-4 border-b border-separator-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-caption-1-regular text-text-tertiary mb-1">考试表格</div>
            <h2 className="text-title-2-regular text-text-primary truncate" style={{ fontWeight: 800 }}>{exam.name}</h2>
            <div className="mt-1 text-caption-1-regular text-text-tertiary">
              {exam.date || "未填写日期"} · {exam.rows.length} 名学生 · {exam.subjects.length} 个科目
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 rounded-full hover:bg-background-tertiary-default text-text-tertiary transition-colors" aria-label="关闭考试表格">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-6 py-3 border-b border-separator-border flex items-center justify-between gap-3">
          <div className="text-caption-1-regular text-text-tertiary">
            每个科目包含成绩、班排、校排；同时存在赋分与原始分时，主值显示赋分。
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-full h-9 pl-8 pr-3 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
              placeholder="搜索学生姓名"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-body-regular">
            <thead className="sticky top-0 z-10 bg-background-primary-default shadow-sm">
              <tr className="text-caption-1-regular text-text-tertiary">
                <th rowSpan={2} className="px-4 py-3 text-left font-semibold w-14">#</th>
                <th rowSpan={2} className="px-4 py-3 text-left font-semibold min-w-28">姓名</th>
                {exam.subjects.map(subject => (
                  <th key={subject} colSpan={3} className="px-4 py-3 text-center font-semibold border-l border-separator-border">
                    {subject}
                  </th>
                ))}
                <th colSpan={3} className="px-4 py-3 text-center font-semibold border-l border-status-ai-100 bg-status-ai-50/70">
                  总分
                </th>
              </tr>
              <tr className="text-[11px] text-text-tertiary">
                {exam.subjects.map(subject => (
                  <th key={`${subject}-sub`} colSpan={3} className="border-l border-separator-border">
                    <div className="grid grid-cols-3">
                      <span className="px-2 py-2">成绩</span>
                      <span className="px-2 py-2 text-accent-500">班排</span>
                      <span className="px-2 py-2">校排</span>
                    </div>
                  </th>
                ))}
                <th colSpan={3} className="border-l border-status-ai-100 bg-status-ai-50/70">
                  <div className="grid grid-cols-3">
                    <span className="px-2 py-2">成绩</span>
                    <span className="px-2 py-2 text-status-ai-600">班排</span>
                    <span className="px-2 py-2">校排</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {rows.map((row, index) => (
                <tr key={row.id} className="odd:bg-background-primary-default even:bg-background-secondary-default/35 hover:bg-accent-50/40 transition-colors">
                  <td className="px-4 py-3 text-text-tertiary">{index + 1}</td>
                  <td className="px-4 py-3 text-text-primary whitespace-nowrap" style={{ fontWeight: 700 }}>{row.name}</td>
                  {exam.subjects.map(subject => {
                    const cell = getCell(row, subject);
                    return (
                      <td key={`${row.id}-${subject}`} colSpan={3} className="border-l border-separator-border">
                        <div className="grid grid-cols-3 text-center">
                          <ScoreValue cell={cell} />
                          <span className="px-2 py-3 text-accent-600 bg-accent-50/40">{formatRank(cell.rankClass)}</span>
                          <span className="px-2 py-3 text-text-secondary">{formatRank(cell.rankSchool)}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td colSpan={3} className="border-l border-status-ai-100 bg-status-ai-50/50">
                    <div className="grid grid-cols-3 text-center">
                      <span className="text-status-ai-700" style={{ fontWeight: 800 }}><ScoreValue cell={row.totalCell || { score: row.total }} /></span>
                      <span className="px-2 py-3 text-status-ai-600">{formatRank(row.rankClass)}</span>
                      <span className="px-2 py-3 text-text-secondary">{formatRank(row.rankSchool)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-6 py-12 text-center text-body-regular text-text-tertiary">没有匹配的学生。</div>
          )}
        </div>
      </div>
    </div>
  );
}
