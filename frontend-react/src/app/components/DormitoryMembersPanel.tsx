import { StudentPicker } from "./StudentPicker";
import { Plus, Search, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { AppStudent } from "../state/types";

export function DormitoryMembersPanel({
  leaderStudentId, onLeaderChange,
  memberListRef, memberStudents, onSelectStudent, removeMemberWithAnimation, memberSearch,
  setMemberSearch, memberCandidatesRef, assignableStudents, addMemberWithAnimation,
}: {
  leaderStudentId?: string;
  onLeaderChange?: (id: string) => void;
  memberListRef: RefObject<HTMLDivElement>;
  memberStudents: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
  removeMemberWithAnimation: (event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) => void;
  memberSearch: string;
  setMemberSearch: (value: string) => void;
  memberCandidatesRef: RefObject<HTMLDivElement>;
  assignableStudents: AppStudent[];
  addMemberWithAnimation: (event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) => void;
}) {
  return (
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
          <div className="border-b border-separator-border bg-gradient-to-r from-white to-accent-50/50 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-body-semibold text-text-primary">宿舍成员</h3>
              <p className="mt-0.5 text-[10px] text-text-tertiary">点击姓名查看学生资料</p>
            </div>
            <span className="rounded-full border border-accent-100 bg-accent-50 px-2 py-0.5 text-caption-1-semibold text-accent-600">{memberStudents.length} 人</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-3 p-3">
            {onLeaderChange && <div className="space-y-1.5"><div className="text-caption-1-semibold text-text-secondary">宿舍长</div><StudentPicker compact allowClear label="宿舍长" students={memberStudents} value={leaderStudentId || ""} onChange={onLeaderChange} /></div>}
            <div ref={memberListRef} className="grid min-h-10 max-h-[45%] shrink-0 gap-2 overflow-y-auto rounded-xl border border-dashed border-accent-100 bg-accent-50/30 p-2">
              {memberStudents.map(student => (
                <div
                  key={student.id}
                  data-selection-motion-id={student.id}
                  className="group flex items-center gap-2 rounded-xl border border-accent-100 bg-background-primary-default p-2 shadow-sm transition-[border-color,box-shadow,transform] duration-200  hover:border-accent-200 hover:shadow-md"
                >
                  <button onClick={() => onSelectStudent(student)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${student.gender === "男" ? "bg-accent-50 text-accent-500" : student.gender === "女" ? "bg-status-pink-50 text-status-pink-500" : "bg-background-tertiary-default text-text-secondary"}`}>
                      {student.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-caption-1-semibold text-text-primary">{student.name}</span>
                      <span className="block text-[10px] text-text-tertiary">{student.gender || "性别未填"} · {student.id === leaderStudentId ? "宿舍长" : "宿舍成员"}</span>
                    </span>
                  </button>
                  <button
                    onClick={event => removeMemberWithAnimation(event, student)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-tertiary opacity-60 transition-all hover:bg-status-danger-50 hover:text-status-danger-500 group-hover:opacity-100"
                    title={`将 ${student.name} 移出宿舍`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {memberStudents.length === 0 && (
                <div className="grid min-h-12 place-items-center text-center text-[11px] text-accent-300">从下方选择学生加入</div>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                value={memberSearch}
                onChange={event => setMemberSearch(event.target.value)}
                className="w-full rounded-xl border border-border-button-default bg-background-secondary-default py-2 pl-7 pr-2 text-body-regular outline-none focus:border-accent-300"
                placeholder="搜索并加入学生"
              />
            </div>
            <div ref={memberCandidatesRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-separator-border bg-background-secondary-default/40 p-1">
              {assignableStudents.map(student => (
                <button
                  key={student.id}
                  data-selection-motion-id={student.id}
                  onClick={event => addMemberWithAnimation(event, student)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-[background-color,transform] duration-200 hover:bg-background-primary-default hover:shadow-sm active:scale-[.99]"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${student.gender === "男" ? "bg-accent-50 text-accent-500" : student.gender === "女" ? "bg-status-pink-50 text-status-pink-500" : "bg-background-tertiary-default text-text-secondary"}`}>
                    {student.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-caption-1-semibold text-text-primary">{student.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-accent-100 bg-background-primary-default px-2 py-0.5 text-[10px] font-semibold text-accent-500 transition-colors group-hover:border-accent-200 group-hover:bg-accent-50">
                    <Plus className="h-2.5 w-2.5" />
                    {student.dormitoryId ? "转入" : "加入"}
                  </span>
                </button>
              ))}
              {assignableStudents.length === 0 && (
                <div className="px-3 py-4 text-center text-caption-1-regular text-text-tertiary">无可加入学生</div>
              )}
            </div>
          </div>
        </aside>
  );
}
