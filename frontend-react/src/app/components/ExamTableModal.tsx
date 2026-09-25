import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input, ModalHeader, useModalFocus } from "./ui";

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
  const titleId = useId();
  const panelRef = useModalFocus(true, onClose);
  const rows = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return exam.rows;
    }
    return exam.rows.filter(row => row.name.includes(keyword));
  }, [exam.rows, query]);

  return (
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-6">
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel-enter app-modal-panel flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden outline-none">
        <ModalHeader eyebrow="考试表格" title={exam.name} titleId={titleId}
          description={`${exam.date || "未填写日期"} · ${exam.rows.length} 名学生 · ${exam.subjects.length} 个科目 · 同时存在赋分与原始分时，主值显示赋分`}
          closeLabel="关闭考试表格" onClose={onClose}
          actions={<Input value={query} onChange={setQuery} leadingIcon={Search} placeholder="搜索学生姓名" aria-label="搜索学生姓名" className="mr-1 w-56" />} />

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
                <th colSpan={3} className="px-4 py-3 text-center font-semibold border-l border-separator-border bg-accent-50/70">
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
                <th colSpan={3} className="border-l border-separator-border bg-accent-50/70">
                  <div className="grid grid-cols-3">
                    <span className="px-2 py-2">成绩</span>
                    <span className="px-2 py-2 text-accent-600">班排</span>
                    <span className="px-2 py-2">校排</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {rows.map((row, index) => (
                <tr key={row.id} className="odd:bg-background-primary-default even:bg-background-secondary-default/35 hover:bg-accent-50/40 transition-colors">
                  <td className="px-4 py-3 text-text-tertiary">{index + 1}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-text-primary">{row.name}</td>
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
                  <td colSpan={3} className="border-l border-separator-border bg-accent-50/50">
                    <div className="grid grid-cols-3 text-center">
                      <span className="font-semibold text-accent-700"><ScoreValue cell={row.totalCell || { score: row.total }} /></span>
                      <span className="px-2 py-3 text-accent-600">{formatRank(row.rankClass)}</span>
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
