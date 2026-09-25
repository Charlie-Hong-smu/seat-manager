import { useState } from "react";

import { DORM_EVENT_PRESETS, type NewDormEventInput } from "../state/dormitoryActions";
import type { AppStudent } from "../state/types";
import { StudentPicker } from "./StudentPicker";
import { NumberStepper } from "./ui";

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
    const effectiveId = lockedResponsible?.id || responsibleId;
    onSubmit({
      reason,
      score,
      note,
      punishment,
      responsibleStudentIds: effectiveId ? [effectiveId] : undefined,
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
              className={`flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-body-semibold transition-colors ${
                active
                  ? positive
                    ? "border-status-success-200 bg-status-success-50 text-status-success-700"
                    : "border-status-danger-200 bg-status-danger-50 text-status-danger-600"
                  : "border-border-button-default bg-background-secondary-default text-text-secondary hover:bg-background-tertiary-default"
              }`}
            >
              <span className="truncate">{preset.label}</span>
              <span className={positive ? "text-status-success-600" : "text-status-danger-500"}>{positive ? "+" : ""}{preset.score}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={reason}
          onChange={event => setReason(event.target.value)}
          className="min-w-0 rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular outline-none focus:border-accent-300"
          placeholder="原因"
        />
        <NumberStepper
          value={score}
          onChange={setScore}
          min={-50}
          max={50}
          ariaLabel="事件分值"
          className={score > 0 ? "border-status-success-200" : score < 0 ? "border-status-danger-200" : ""}
        />
      </div>

      {!lockedResponsible && <StudentPicker students={members} value={responsibleId} onChange={setResponsibleId} label="责任人（可选）" allowClear />}

      <input
        value={note}
        onChange={event => setNote(event.target.value)}
        className="w-full rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular outline-none focus:border-accent-300"
        placeholder="备注（可选）"
      />

      <input
        value={punishment}
        onChange={event => setPunishment(event.target.value)}
        className="w-full rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular outline-none focus:border-accent-300"
        placeholder="处罚措施（可选，例如：打扫宿舍一周）"
      />

      <label className={`flex items-center gap-2 text-body-regular ${canSync ? "text-text-secondary" : "text-text-tertiary"}`}>
        <input
          type="checkbox"
          checked={canSync && recordToStudent}
          disabled={!canSync}
          onChange={event => setRecordToStudent(event.target.checked)}
          className="accent-accent-600"
        />
        同时记入责任人个人档案
        {!canSync && <span className="text-caption-1-regular text-text-tertiary">（需先指定责任人）</span>}
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!reason.trim()}
        className="w-full rounded-xl bg-accent-600 py-2.5 text-body-semibold text-text-white hover:bg-accent-700 disabled:bg-background-tertiary-default disabled:text-text-tertiary"
      >
        {submitLabel}
      </button>
    </div>
  );
}
