import { useState } from "react";

import { DORM_EVENT_PRESETS, type NewDormEventInput } from "../state/dormitoryActions";
import type { AppStudent } from "../state/types";

interface DormEventFormProps {
  /** 可作为责任人的成员；当 lockedResponsible 存在时忽略。 */
  members: AppStudent[];
  /** 责任人固定为某个学生（用于学生详情内录入），此时隐藏选择框。 */
  lockedResponsible?: { id: string; name: string };
  submitLabel?: string;
  onSubmit: (input: Omit<NewDormEventInput, "dormId">) => void;
}

export function DormEventForm({ members, lockedResponsible, submitLabel = "保存事件", onSubmit }: DormEventFormProps) {
  const [reason, setReason] = useState(DORM_EVENT_PRESETS[0]?.label || "");
  const [score, setScore] = useState(DORM_EVENT_PRESETS[0]?.score ?? -1);
  const [note, setNote] = useState("");
  const [punishment, setPunishment] = useState("");
  const [responsibleId, setResponsibleId] = useState(lockedResponsible?.id || "");
  const [recordToStudent, setRecordToStudent] = useState(true);

  const effectiveResponsibleId = lockedResponsible?.id || responsibleId;
  const canSync = Boolean(effectiveResponsibleId);

  function submit() {
    if (!reason.trim()) {
      return;
    }
    onSubmit({
      reason,
      score,
      note,
      punishment,
      responsibleStudentId: lockedResponsible?.id || responsibleId || undefined,
      recordToStudent: canSync ? recordToStudent : false,
    });
    setNote("");
    setPunishment("");
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DORM_EVENT_PRESETS.map(preset => {
          const active = reason === preset.label && score === preset.score;
          const positive = preset.score > 0;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setReason(preset.label);
                setScore(preset.score);
              }}
              className={`flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? positive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-600"
                  : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="truncate">{preset.label}</span>
              <span className={positive ? "text-emerald-600" : "text-red-500"}>{positive ? "+" : ""}{preset.score}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <input
          value={reason}
          onChange={event => setReason(event.target.value)}
          className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
          placeholder="原因"
        />
        <input
          type="number"
          value={score}
          onChange={event => setScore(Number(event.target.value) || 0)}
          className={`rounded-xl border bg-gray-50 px-2 py-2 text-center text-sm font-semibold outline-none focus:border-blue-300 ${
            score > 0 ? "border-emerald-200 text-emerald-600" : score < 0 ? "border-red-200 text-red-500" : "border-gray-200 text-gray-600"
          }`}
        />
      </div>

      {!lockedResponsible && (
        <select
          value={responsibleId}
          onChange={event => setResponsibleId(event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
        >
          <option value="">不指定责任人（仅记宿舍分）</option>
          {members.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
        </select>
      )}

      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
        placeholder="备注（可选）"
      />

      <input
        value={punishment}
        onChange={event => setPunishment(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
        placeholder="处罚措施（可选，例如：打扫宿舍一周）"
      />

      <label className={`flex items-center gap-2 text-sm ${canSync ? "text-gray-600" : "text-gray-300"}`}>
        <input
          type="checkbox"
          checked={canSync && recordToStudent}
          disabled={!canSync}
          onChange={event => setRecordToStudent(event.target.checked)}
          className="accent-blue-600"
        />
        同时记入责任人个人档案
        {!canSync && <span className="text-xs text-gray-300">（需先指定责任人）</span>}
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!reason.trim()}
        className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"
      >
        {submitLabel}
      </button>
    </div>
  );
}
