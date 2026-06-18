import { useState } from "react";
import { X, Trash2, Plus, Star, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import {
  Student, STUDENTS, EXAMS, SAMPLE_RECORDS,
  getStudentExamScores, getBestSubject, getWeakSubject,
} from "./mockData";

interface Props {
  student: Student;
  onClose: () => void;
}

type RecordType = "reward" | "punish" | "note";

interface LocalRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
}

const WEEKS = [
  "2026-06-14（本周）",
  "2026-06-07",
  "2026-05-31",
  "2026-05-24",
  "2026-05-17",
];

export function StudentModal({ student, onClose }: Props) {
  const [noteInput, setNoteInput] = useState("");
  const [localRecords, setLocalRecords] = useState<LocalRecord[]>(() =>
    SAMPLE_RECORDS.filter(r => r.studentId === student.id).map(r => ({
      id: r.id,
      type: r.type,
      note: r.note,
      date: r.date,
    }))
  );
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0]);
  const [syncSearch, setSyncSearch] = useState("");
  const [syncSelected, setSyncSelected] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const examScores = getStudentExamScores(student.id);

  function addRecord(type: RecordType) {
    if (type !== "note" && !noteInput.trim() && !window.confirm("不填备注直接添加？")) return;
    const newRecord: LocalRecord = {
      id: `local-${Date.now()}`,
      type,
      note: noteInput.trim(),
      date: "2026-06-14",
    };
    setLocalRecords(prev => [newRecord, ...prev]);
    setNoteInput("");
  }

  const syncCandidates = STUDENTS.filter(s => s.id !== student.id && s.name.includes(syncSearch));

  function toggleSync(id: number) {
    setSyncSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const recordTypeStyle: Record<RecordType, { bg: string; text: string; label: string }> = {
    reward: { bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700", label: "奖" },
    punish: { bg: "bg-red-50 border-red-100", text: "text-red-600", label: "罚" },
    note:   { bg: "bg-gray-50 border-gray-100", text: "text-gray-600", label: "备注" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mb-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <div className="text-xs text-gray-400 mb-1" style={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>奖罚记录</div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem" }}>
              {student.name}
              <span className="text-gray-400 ml-2" style={{ fontWeight: 400, fontSize: "0.875rem" }}>· 周起始 2026-06-14</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {showDeleteConfirm ? (
              <>
                <span className="text-xs text-red-500 mr-1">确认删除？</span>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">取消</button>
                <button className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors" style={{ fontWeight: 600 }}>确认</button>
              </>
            ) : (
              <>
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors" style={{ fontWeight: 600 }}>
                  <Trash2 className="w-3.5 h-3.5" />删除学生
                </button>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-12rem)]">
          {/* Record Actions */}
          <div className="flex items-center gap-2">
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="备注（可选）"
              maxLength={40}
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
            />
            <button onClick={() => addRecord("reward")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />奖
            </button>
            <button onClick={() => addRecord("punish")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />罚
            </button>
            <button onClick={() => addRecord("note")} className="shrink-0 px-3.5 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
              + 备注
            </button>
          </div>

          {/* Sync to other students */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm text-gray-600" style={{ fontWeight: 600 }}>同步到其他学生（可选）</span>
              <div className="flex gap-2">
                <button onClick={() => setSyncSelected(new Set(STUDENTS.filter(s => s.id !== student.id).map(s => s.id)))} className="text-xs text-blue-600 hover:underline">全选</button>
                <button onClick={() => setSyncSelected(new Set())} className="text-xs text-gray-400 hover:underline">清空</button>
              </div>
            </div>
            <div className="px-3 pt-2 pb-1">
              <input
                value={syncSearch}
                onChange={e => setSyncSearch(e.target.value)}
                placeholder="搜索姓名"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 mb-2"
              />
              <div className="max-h-32 overflow-y-auto space-y-0.5 pb-2">
                {syncCandidates.slice(0, 12).map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncSelected.has(s.id)}
                      onChange={() => toggleSync(s.id)}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Week selector + Records */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600" style={{ fontWeight: 600 }}>查看周</span>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 cursor-pointer"
            >
              {WEEKS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          {localRecords.length > 0 ? (
            <div className="space-y-2">
              {localRecords.map(record => (
                <div key={record.id} className={`flex items-center gap-3 px-4 py-3 border rounded-xl ${recordTypeStyle[record.type].bg}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${recordTypeStyle[record.type].bg} ${recordTypeStyle[record.type].text}`} style={{ fontWeight: 700 }}>
                    {recordTypeStyle[record.type].label}
                  </span>
                  <span className={`flex-1 text-sm ${recordTypeStyle[record.type].text}`}>{record.note || "(无备注)"}</span>
                  <span className="text-xs text-gray-400">{record.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">本周暂无记录，可以先来添加奖罚。</p>
          )}

          {/* Exam Scores */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9375rem" }}>考试成绩</h4>
            <div className="space-y-4">
              {examScores.map(({ exam, score }) => {
                const best = getBestSubject(score.scores);
                const weak = getWeakSubject(score.scores);
                return (
                  <div key={exam.id} className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>{exam.name}</span>
                      <span className="text-xs text-gray-400">{exam.date}</span>
                    </div>
                    <div className="p-4">
                      {/* Subject scores grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {exam.subjects.map(sub => {
                          const subScore = score.scores[sub] ?? 0;
                          const isBest = sub === best;
                          const isWeak = sub === weak;
                          return (
                            <div key={sub} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm ${
                              isBest ? "border-emerald-100 bg-emerald-50" :
                              isWeak ? "border-red-100 bg-red-50" :
                              "border-gray-100 bg-white"
                            }`}>
                              <span className={`${isBest ? "text-emerald-700" : isWeak ? "text-red-500" : "text-gray-600"}`} style={{ fontWeight: 600 }}>{sub}</span>
                              <span className={`${isBest ? "text-emerald-700" : isWeak ? "text-red-500" : "text-gray-800"}`} style={{ fontWeight: 700 }}>{subScore}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Summary */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="text-gray-400">总分</span>
                          <span className="text-blue-700" style={{ fontWeight: 800, fontSize: "1.125rem" }}>{score.total}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <span>总排名</span>
                          <span className="text-gray-700" style={{ fontWeight: 700 }}>第 {score.classRank} 名</span>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-emerald-600">
                            <TrendingUp className="w-3 h-3" />{best}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-red-400">
                            <TrendingDown className="w-3 h-3" />{weak}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9375rem" }}>学生标签</h4>
            <div className="flex flex-wrap gap-2">
              {student.academicTags.length > 0 ? student.academicTags.map(tag => {
                const isStrong = tag.endsWith("强");
                return (
                  <span key={tag} className={`px-2.5 py-1 rounded-full text-sm border ${isStrong ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-500 border-red-100"}`} style={{ fontWeight: 600 }}>
                    {tag}
                  </span>
                );
              }) : <span className="text-sm text-gray-400">暂无标签</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
