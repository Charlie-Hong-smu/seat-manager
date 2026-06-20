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
    <div className="fixed inset-0 z-50 bg-gray-950/35 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-6xl max-h-[86vh] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        <div className="shrink-0 px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 mb-1">考试表格</div>
            <h2 className="text-xl text-gray-900 truncate" style={{ fontWeight: 800 }}>{exam.name}</h2>
            <div className="mt-1 text-xs text-gray-400">
              {exam.date || "未填写日期"} · {exam.rows.length} 名学生 · {exam.subjects.length} 个科目
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors" aria-label="关闭考试表格">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-6 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            每个科目包含成绩、班排、校排；总分区域用浅紫色区分。
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-full h-9 pl-8 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
              placeholder="搜索学生姓名"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#f3f4f6]">
              <tr className="text-xs text-gray-400">
                <th rowSpan={2} className="px-4 py-3 text-left font-semibold w-14">#</th>
                <th rowSpan={2} className="px-4 py-3 text-left font-semibold min-w-28">姓名</th>
                {exam.subjects.map(subject => (
                  <th key={subject} colSpan={3} className="px-4 py-3 text-center font-semibold border-l border-gray-50">
                    {subject}
                  </th>
                ))}
                <th colSpan={3} className="px-4 py-3 text-center font-semibold border-l border-violet-100 bg-violet-50/70">
                  总分
                </th>
              </tr>
              <tr className="text-[11px] text-gray-400">
                {exam.subjects.map(subject => (
                  <th key={`${subject}-sub`} colSpan={3} className="border-l border-gray-50">
                    <div className="grid grid-cols-3">
                      <span className="px-2 py-2">成绩</span>
                      <span className="px-2 py-2 text-blue-500">班排</span>
                      <span className="px-2 py-2">校排</span>
                    </div>
                  </th>
                ))}
                <th colSpan={3} className="border-l border-violet-100 bg-violet-50/70">
                  <div className="grid grid-cols-3">
                    <span className="px-2 py-2">成绩</span>
                    <span className="px-2 py-2 text-violet-600">班排</span>
                    <span className="px-2 py-2">校排</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, index) => (
                <tr key={row.id} className="odd:bg-white even:bg-gray-50/35 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-800 whitespace-nowrap" style={{ fontWeight: 700 }}>{row.name}</td>
                  {exam.subjects.map(subject => {
                    const cell = getCell(row, subject);
                    return (
                      <td key={`${row.id}-${subject}`} colSpan={3} className="border-l border-gray-50">
                        <div className="grid grid-cols-3 text-center">
                          <span className="px-2 py-3 text-gray-700">{formatScore(cell.score)}</span>
                          <span className="px-2 py-3 text-blue-600 bg-blue-50/40">{formatRank(cell.rankClass)}</span>
                          <span className="px-2 py-3 text-gray-500">{formatRank(cell.rankSchool)}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td colSpan={3} className="border-l border-violet-100 bg-violet-50/50">
                    <div className="grid grid-cols-3 text-center">
                      <span className="px-2 py-3 text-violet-700" style={{ fontWeight: 800 }}>{formatScore(row.total)}</span>
                      <span className="px-2 py-3 text-violet-600">{formatRank(row.rankClass)}</span>
                      <span className="px-2 py-3 text-gray-500">{formatRank(row.rankSchool)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-gray-400">没有匹配的学生。</div>
          )}
        </div>
      </div>
    </div>
  );
}
