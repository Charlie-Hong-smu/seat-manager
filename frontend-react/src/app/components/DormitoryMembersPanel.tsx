import { Plus, Search, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { AppStudent } from "../state/types";

export function DormitoryMembersPanel({
  memberListRef, memberStudents, onSelectStudent, removeMemberWithAnimation, memberSearch,
  setMemberSearch, memberCandidatesRef, assignableStudents, addMemberWithAnimation,
}: {
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
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gradient-to-r from-white to-blue-50/50 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800">宿舍成员</h3>
              <p className="mt-0.5 text-[10px] text-gray-400">点击姓名查看学生资料</p>
            </div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">{memberStudents.length} 人</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <div ref={memberListRef} className="grid min-h-10 gap-2 rounded-xl border border-dashed border-blue-100 bg-blue-50/30 p-2">
              {memberStudents.map(student => (
                <div
                  key={student.id}
                  data-selection-motion-id={student.id}
                  className="dorm-member-enter group flex items-center gap-2 rounded-xl border border-blue-100 bg-white p-2 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-blue-200 hover:shadow-md"
                >
                  <button onClick={() => onSelectStudent(student)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${student.gender === "男" ? "bg-blue-50 text-blue-500" : student.gender === "女" ? "bg-pink-50 text-pink-500" : "bg-gray-100 text-gray-500"}`}>
                      {student.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-gray-800">{student.name}</span>
                      <span className="block text-[10px] text-gray-400">{student.gender || "性别未填"} · 宿舍成员</span>
                    </span>
                  </button>
                  <button
                    onClick={event => removeMemberWithAnimation(event, student)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gray-300 opacity-60 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title={`将 ${student.name} 移出宿舍`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {memberStudents.length === 0 && (
                <div className="grid min-h-12 place-items-center text-center text-[11px] text-blue-300">从下方选择学生加入</div>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={memberSearch}
                onChange={event => setMemberSearch(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-7 pr-2 text-sm outline-none focus:border-blue-300"
                placeholder="搜索并加入学生"
              />
            </div>
            <div ref={memberCandidatesRef} className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/40 p-1">
              {assignableStudents.map(student => (
                <button
                  key={student.id}
                  data-selection-motion-id={student.id}
                  onClick={event => addMemberWithAnimation(event, student)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-[background-color,transform] duration-200 hover:bg-white hover:shadow-sm active:scale-[.99]"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${student.gender === "男" ? "bg-blue-50 text-blue-500" : student.gender === "女" ? "bg-pink-50 text-pink-500" : "bg-gray-100 text-gray-500"}`}>
                    {student.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">{student.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-blue-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-500 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50">
                    <Plus className="h-2.5 w-2.5" />
                    {student.dormitoryId ? "转入" : "加入"}
                  </span>
                </button>
              ))}
              {assignableStudents.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-400">无可加入学生</div>
              )}
            </div>
          </div>
        </aside>
  );
}
