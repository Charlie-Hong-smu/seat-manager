import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, TrendingDown, TrendingUp } from "lucide-react";

import { FUND_EXPENSE_PRESETS, FUND_INCOME_PRESETS, type NewFundTxInput } from "../state/classFundActions";
import type { AppStudent, FundTxType } from "../state/types";

interface FundTransactionFormProps {
  students: AppStudent[];
  onSubmit: (input: NewFundTxInput) => void;
}

export function FundTransactionForm({ students, onSubmit }: FundTransactionFormProps) {
  const [type, setType] = useState<FundTxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(FUND_EXPENSE_PRESETS[0]?.category || "活动支出");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showRelated, setShowRelated] = useState(false);
  const [relatedId, setRelatedId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const presets = type === "income" ? FUND_INCOME_PRESETS : FUND_EXPENSE_PRESETS;
  const activeColor = type === "income" ? "emerald" : "red";
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

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    onSubmit({
      type,
      amount: value,
      category,
      note: note || undefined,
      relatedStudentId: relatedId || undefined,
      date,
    });
    setAmount("");
    setNote("");
    setRelatedId("");
    setStudentSearch("");
    setShowRelated(false);
  }

  const filteredStudents = studentSearch.trim()
    ? students.filter(s => s.name.includes(studentSearch.trim()) || s.aliases.some(a => a.includes(studentSearch.trim())))
    : students;

  const relatedStudent = students.find(s => s.id === relatedId);

  useEffect(() => {
    if (showRelated && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showRelated]);

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
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-blue-300"
      />

      {/* 关联学生（可展开，带动画） */}
      <div>
        <button
          type="button"
          onClick={() => setShowRelated(!showRelated)}
          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showRelated ? "rotate-180" : ""}`} />
          关联学生（可选）
          {relatedStudent && <span className="text-blue-500">· {relatedStudent.name}</span>}
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            showRelated ? "max-h-80 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"
          }`}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300"
              placeholder="搜索学生姓名"
            />
            {searchFocused && filteredStudents.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                {filteredStudents.map(student => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      setRelatedId(student.id);
                      setStudentSearch(student.name);
                      setSearchFocused(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                      relatedId === student.id ? "bg-blue-50 text-blue-600" : "text-gray-700"
                    }`}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {relatedId && !searchFocused && (
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                {relatedStudent?.name}
              </span>
              <button
                type="button"
                onClick={() => { setRelatedId(""); setStudentSearch(""); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                清除
              </button>
            </div>
          )}
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
