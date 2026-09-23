import { useState } from "react";
import { buildWeeklyFacts, getWeekRange } from "../state/teacherWorkbench";
import type { AppStudent, AttendanceRecord, CommunicationDraft, Dormitory, FollowupTask, HomeworkAssignment } from "../state/types";
import { CommunicationEditor, type SaveCommunication } from "./CommunicationEditor";
import { SelectMenu } from "./ui";

export function StudentCommunicationPanel({ student, students, attendance, tasks, homework, dormitories, drafts, onSave }: { student: AppStudent; students: AppStudent[]; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[]; dormitories: Dormitory[]; drafts: CommunicationDraft[]; onSave?: SaveCommunication }) {
  const [historyId, setHistoryId] = useState("");
  const history = drafts.filter(item => item.scope === "student" && item.studentId === student.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const currentRange = getWeekRange();
  const historical = history.find(item => item.id === historyId);
  const range = historical || currentRange;
  const saved = historical || history.find(item => item.startDate === range.startDate && item.endDate === range.endDate);
  const facts = historical?.facts || buildWeeklyFacts({ students, attendance, tasks, homework, dormitories, ...range, studentId: student.id });
  return <div className="space-y-4">
    <SelectMenu value={historyId} onChange={value => setHistoryId(String(value))} ariaLabel="沟通稿记录" options={[{ value: "", label: "本周沟通稿" }, ...history.map(item => ({ value: item.id, label: `${item.startDate} — ${item.endDate}${item.deliveryStatus === "shared" ? " · 已沟通" : " · 草稿"}` }))]}/>
    <CommunicationEditor key={`${student.id}:${range.startDate}:${range.endDate}`} scope="student" studentId={student.id} subjectName={student.name} startDate={range.startDate} endDate={range.endDate} facts={facts} saved={saved} onSave={onSave}/>
  </div>;
}
