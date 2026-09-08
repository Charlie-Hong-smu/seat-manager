import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { FUND_EXPENSE_PRESETS, FUND_INCOME_PRESETS, type NewFundTxInput } from "../state/classFundActions";
import { matchesStudentSearch } from "../state/studentSearch";
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
    ? "bg-status-success-500 text-text-white"
    : "bg-status-danger-500 text-text-white";
  const inactiveClass = "bg-background-tertiary-default text-text-secondary hover:bg-background-tertiary-hover";
  const selectedPresetClass = type === "income"
    ? "bg-status-success-500 text-text-white border-status-success-500"
    : "bg-status-danger-500 text-text-white border-status-danger-500";
  const unselectedPresetClass = "bg-background-primary-default text-text-secondary border-border-button-default hover:border-border-button-hover";

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
    ? students.filter(student => matchesStudentSearch(student, studentSearch))
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
          className={`rounded-xl px-4 py-2.5 text-body-semibold transition-colors ${
            type === "expense" ? activeClass : inactiveClass
          }`}
        >
          支出
        </button>
        <button
          type="button"
          onClick={() => switchType("income")}
          className={`rounded-xl px-4 py-2.5 text-body-semibold transition-colors ${
            type === "income" ? activeClass : inactiveClass
          }`}
        >
          收入
        </button>
      </div>

      {/* 金额 */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-regular text-text-tertiary">¥</span>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full rounded-xl border border-border-button-default bg-background-primary-default py-3 pl-8 pr-3 text-title-3-semibold text-text-primary outline-none transition-colors focus:border-accent-300"
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      </div>

      {/* 类别 */}
      <div>
        <div className="mb-2 text-caption-1-regular text-text-tertiary">类别</div>
        <div className="flex flex-wrap gap-2">
          {presets.map(preset => (
            <button
              key={preset.category}
              type="button"
              onClick={() => setCategory(preset.category)}
              className={`rounded-full border px-3 py-1 text-caption-1-semibold transition-colors ${
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
        className="w-full rounded-xl border border-border-button-default bg-background-primary-default px-3.5 py-2.5 text-body-regular text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-300"
        placeholder="说明（可选）"
      />

      {/* 日期 */}
      <DatePicker value={date} onChange={setDate} ariaLabel="交易日期" className="w-full" />

      {/* 关联学生（可展开，带动画，多选） */}
      <div>
        <button
          type="button"
          onClick={() => setShowRelated(!showRelated)}
          className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showRelated ? "rotate-180" : ""}`} />
          关联学生（可选，可多选）
          {relatedIds.length > 0 && <span className="text-accent-500">· 已选 {relatedIds.length} 人</span>}
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            showRelated ? "max-h-96 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"
          }`}
        >
          {/* 已选学生：精确飞入落点，删除时反向返回候选列表 */}
          <div ref={selectedStudentsRef} className="mb-2 flex min-h-9 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-accent-100 bg-accent-50/40 px-2 py-1.5">
            {selectedRelatedStudents.length > 0 ? selectedRelatedStudents.map(student => (
              <span
                key={student.id}
                data-selection-motion-id={student.id}
                className="dorm-member-enter inline-flex items-center gap-1 rounded-full border border-accent-200 bg-background-primary-default py-1 pl-2.5 pr-1 text-caption-1-semibold text-accent-700 shadow-sm"
              >
                {student.name}
                <button
                  type="button"
                  onClick={event => removeRelatedWithAnimation(event, student)}
                  className="grid h-4 w-4 place-items-center rounded-full text-accent-300 hover:bg-status-danger-100 hover:text-status-danger-500"
                  title={`取消关联 ${student.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )) : (
              <span className="text-[11px] text-accent-300">点击下方学生添加关联</span>
            )}
          </div>
          {/* 搜索 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              className="w-full rounded-xl border border-border-button-default bg-background-primary-default py-2.5 pl-9 pr-3 text-body-regular outline-none transition-colors focus:border-accent-300"
              placeholder="搜索学生姓名"
            />
          </div>
          {/* 学生列表（多选切换） */}
          <div ref={studentCandidatesRef} className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-separator-border bg-background-primary-default py-1">
            {filteredStudents.length === 0 ? (
              <div className="py-3 text-center text-caption-1-regular text-text-tertiary">无匹配学生</div>
            ) : (
              filteredStudents.map(student => {
                const selected = relatedIds.includes(student.id);
                return (
                  <button
                    key={student.id}
                    data-selection-motion-id={student.id}
                    type="button"
                    onClick={event => toggleRelatedWithAnimation(event, student, selected)}
                    className={`group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-regular transition-[background-color,color,transform] duration-200 hover:bg-accent-50 active:scale-[.99] ${
                      selected ? "bg-accent-50 text-accent-600" : "text-text-primary"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${student.gender === "男" ? "bg-accent-50 text-accent-500" : student.gender === "女" ? "bg-status-pink-50 text-status-pink-500" : "bg-background-tertiary-default text-text-secondary"}`}>
                        {student.name.slice(0, 1)}
                      </span>
                      <span className="truncate font-semibold">{student.name}</span>
                    </span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="text-[10px] font-semibold text-accent-300 group-hover:text-accent-500">加入</span>}
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
        className={`w-full rounded-xl py-2.5 text-body-semibold text-text-white transition-colors disabled:bg-background-tertiary-default disabled:text-text-tertiary ${
          type === "income" ? "bg-status-success-500 hover:bg-status-success-600" : "bg-status-danger-500 hover:bg-status-danger-600"
        }`}
      >
        — 记录{type === "income" ? "收入" : "支出"}
      </button>
    </div>
  );
}
