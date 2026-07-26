import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { FUND_EXPENSE_PRESETS, FUND_INCOME_PRESETS, type NewFundTxInput } from "../state/classFundActions";
import type { AppStudent, FundTxType } from "../state/types";
import { animateSelectionTransfer } from "./selectionMotion";
import { DatePicker } from "./ui";
import { toLocalDateKey } from "../state/dateKey";

interface FundTransactionFormProps {
  students: AppStudent[];
  onSubmit: (input: NewFundTxInput) => void;
}

export function FundTransactionForm({ students, onSubmit }: FundTransactionFormProps) {
  const [type, setType] = useState<FundTxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(FUND_EXPENSE_PRESETS[0]?.category || "活动支出");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => toLocalDateKey());
  const [showRelated, setShowRelated] = useState(false);
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const selectedStudentsRef = useRef<HTMLDivElement>(null);
  const studentCandidatesRef = useRef<HTMLDivElement>(null);

  const presets = type === "income" ? FUND_INCOME_PRESETS : FUND_EXPENSE_PRESETS;
  const activeClass = type === "income"
    ? "bg-emerald-500 text-white"
    : "bg-red-500 text-white";
  const inactiveClass = "bg-gray-100 text-gray-500 hover:bg-gray-200";
  const selectedPresetClass = type === "income"
    ? "bg-emerald-500 text-white border-emerald-500"
    : "bg-red-500 text-white border-red-500";
  const unselectedPresetClass = "bg-white text-gray-600 border-gray-200 hover:border-gray-300";

  function switchType(next: FundTxType) {
    if (next === type) return;
    setType(next);
    const nextPresets = next === "income" ? FUND_INCOME_PRESETS : FUND_EXPENSE_PRESETS;
    setCategory(nextPresets[0]?.category || "");
    setNote("");
  }

  function toggleRelated(studentId: string) {
    setRelatedIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  }

  function toggleRelatedWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent, selected: boolean) {
    const selectedElement = selectedStudentsRef.current
      ? Array.from(selectedStudentsRef.current.querySelectorAll<HTMLElement>("[data-selection-motion-id]")).find(element => element.dataset.selectionMotionId === student.id)
      : null;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: selected ? selectedElement || event.currentTarget : event.currentTarget,
      sourceContainer: selected ? selectedStudentsRef.current : studentCandidatesRef.current,
      targetContainer: selected ? studentCandidatesRef.current : selectedStudentsRef.current,
      commit: () => toggleRelated(student.id),
    });
  }

  function removeRelatedWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const chip = event.currentTarget.closest<HTMLElement>("[data-selection-motion-id]") || event.currentTarget;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: chip,
      sourceContainer: selectedStudentsRef.current,
      targetContainer: studentCandidatesRef.current,
      commit: () => toggleRelated(student.id),
    });
  }

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onSubmit({
      type,
      amount: value,
      category,
      note: note || undefined,
      relatedStudentIds: relatedIds.length > 0 ? relatedIds : undefined,
      date,
    });
    setAmount("");
    setNote("");
    setRelatedIds([]);
    setStudentSearch("");
    setShowRelated(false);
  }

  const filteredStudents = studentSearch.trim()
    ? students.filter(s => s.name.includes(studentSearch.trim()) || s.aliases.some(a => a.includes(studentSearch.trim())))
    : students;

  const selectedRelatedStudents = relatedIds
    .map(id => students.find(s => s.id === id))
    .filter((s): s is AppStudent => Boolean(s));

  return (
    <div className="space-y-4">
      {/* 收入/支出切换 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchType("expense")}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            type === "expense" ? activeClass : inactiveClass
          }`}
        >
          支出
        </button>
        <button
          type="button"
          onClick={() => switchType("income")}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            type === "income" ? activeClass : inactiveClass
          }`}
        >
          收入
        </button>
      </div>

      {/* 金额 */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">¥</span>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-8 pr-3 text-lg font-semibold text-gray-900 outline-none transition-colors focus:border-blue-300"
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      </div>

      {/* 类别 */}
      <div>
        <div className="mb-2 text-xs text-gray-400">类别</div>
        <div className="flex flex-wrap gap-2">
          {presets.map(preset => (
            <button
              key={preset.category}
              type="button"
              onClick={() => setCategory(preset.category)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                category === preset.category ? selectedPresetClass : unselectedPresetClass
              }`}
            >
              {preset.category}
            </button>
          ))}
        </div>
      </div>

      {/* 说明 */}
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-300"
        placeholder="说明（可选）"
      />

      {/* 日期 */}
      <DatePicker value={date} onChange={setDate} ariaLabel="交易日期" className="w-full" />

      {/* 关联学生（可展开，带动画，多选） */}
      <div>
        <button
          type="button"
          onClick={() => setShowRelated(!showRelated)}
          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showRelated ? "rotate-180" : ""}`} />
          关联学生（可选，可多选）
          {relatedIds.length > 0 && <span className="text-blue-500">· 已选 {relatedIds.length} 人</span>}
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            showRelated ? "max-h-96 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"
          }`}
        >
          {/* 已选学生：精确飞入落点，删除时反向返回候选列表 */}
          <div ref={selectedStudentsRef} className="mb-2 flex min-h-9 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-blue-100 bg-blue-50/40 px-2 py-1.5">
            {selectedRelatedStudents.length > 0 ? selectedRelatedStudents.map(student => (
              <span
                key={student.id}
                data-selection-motion-id={student.id}
                className="dorm-member-enter inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white py-1 pl-2.5 pr-1 text-xs font-semibold text-blue-700 shadow-sm"
              >
                {student.name}
                <button
                  type="button"
                  onClick={event => removeRelatedWithAnimation(event, student)}
                  className="grid h-4 w-4 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500"
                  title={`取消关联 ${student.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )) : (
              <span className="text-[11px] text-blue-300">点击下方学生添加关联</span>
            )}
          </div>
          {/* 搜索 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300"
              placeholder="搜索学生姓名"
            />
          </div>
          {/* 学生列表（多选切换） */}
          <div ref={studentCandidatesRef} className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1">
            {filteredStudents.length === 0 ? (
              <div className="py-3 text-center text-xs text-gray-400">无匹配学生</div>
            ) : (
              filteredStudents.map(student => {
                const selected = relatedIds.includes(student.id);
                return (
                  <button
                    key={student.id}
                    data-selection-motion-id={student.id}
                    type="button"
                    onClick={event => toggleRelatedWithAnimation(event, student, selected)}
                    className={`group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-[background-color,color,transform] duration-200 hover:bg-blue-50 active:scale-[.99] ${
                      selected ? "bg-blue-50 text-blue-600" : "text-gray-700"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${student.gender === "男" ? "bg-blue-50 text-blue-500" : student.gender === "女" ? "bg-pink-50 text-pink-500" : "bg-gray-100 text-gray-500"}`}>
                        {student.name.slice(0, 1)}
                      </span>
                      <span className="truncate font-semibold">{student.name}</span>
                    </span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="text-[10px] font-semibold text-blue-300 group-hover:text-blue-500">加入</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 提交 */}
      <button
        type="button"
        onClick={submit}
        disabled={!amount || Number(amount) <= 0}
        className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:bg-gray-100 disabled:text-gray-300 ${
          type === "income" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
        }`}
      >
        — 记录{type === "income" ? "收入" : "支出"}
      </button>
    </div>
  );
}
