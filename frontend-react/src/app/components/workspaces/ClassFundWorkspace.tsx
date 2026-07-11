import { useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";

import { calcBalance, calcExpenseTotal, calcIncomeTotal, filterFundTransactionsByPeriod, getFundPeriodRange, shiftFundPeriod, type FundPeriodMode, type NewFundTxInput } from "../../state/classFundActions";
import type { AppStudent, FundTransaction, FundTxType } from "../../state/types";
import { FundTransactionForm } from "../FundTransactionForm";
import { Card, IconButton, SegmentedControl } from "../ui";

function formatCurrency(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ClassFundWorkspace({
  transactions,
  students,
  onAdd,
  onUpdate,
  onDelete,
  onClearAll,
}: {
  transactions: FundTransaction[];
  students: AppStudent[];
  onAdd: (input: NewFundTxInput) => void;
  onUpdate: (id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentIds">>) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [editingId, setEditingId] = useState("");
  const [editType, setEditType] = useState<FundTxType>("income");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [periodMode, setPeriodMode] = useState<FundPeriodMode>("month");
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date().toISOString().slice(0, 10));

  const periodTransactions = filterFundTransactionsByPeriod(transactions, periodMode, periodAnchor);
  const periodRange = getFundPeriodRange(periodMode, periodAnchor);
  const balance = calcBalance(periodTransactions);
  const incomeTotal = calcIncomeTotal(periodTransactions);
  const expenseTotal = calcExpenseTotal(periodTransactions);

  function startEdit(tx: FundTransaction) {
    setEditingId(tx.id);
    setEditType(tx.type);
    setEditAmount(String(tx.amount));
    setEditCategory(tx.category);
    setEditNote(tx.note);
    setEditDate(tx.date);
  }

  function saveEdit() {
    if (!editingId) {
      return;
    }
    const value = Number(editAmount);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    onUpdate(editingId, {
      type: editType,
      amount: Math.abs(value),
      category: editCategory,
      note: editNote,
      date: editDate,
    });
    setEditingId("");
  }

  function handleClearAll() {
    if (transactions.length === 0) {
      return;
    }
    if (window.confirm(`确定清空全部 ${transactions.length} 条交易记录？此操作不可撤销。`)) {
      onClearAll();
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Card className="surface-enter" bodyClassName="flex flex-wrap items-center gap-3 p-3">
            <SegmentedControl value={periodMode} onChange={setPeriodMode} ariaLabel="班费统计周期" options={[{ value: "all", label: "全部" }, { value: "week", label: "本周" }, { value: "month", label: "本月" }]} />
            {periodMode !== "all" && <><IconButton size="sm" label="上一个周期" onClick={() => setPeriodAnchor(current => shiftFundPeriod(periodMode, current, -1))}><ChevronLeft className="h-4 w-4" /></IconButton><label className="flex h-9 items-center gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3"><CalendarRange className="h-4 w-4 text-blue-500" /><input type="date" value={periodAnchor} onChange={event => setPeriodAnchor(event.target.value)} className="bg-transparent text-sm outline-none" /></label><IconButton size="sm" label="下一个周期" onClick={() => setPeriodAnchor(current => shiftFundPeriod(periodMode, current, 1))}><ChevronRight className="h-4 w-4" /></IconButton><span className="text-xs font-bold text-[var(--app-text-muted)]">{periodRange?.label}</span></>}
          </Card>
          {/* 统计卡：左大余额 + 右两小卡 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_12rem]">
            <Card className="surface-enter" bodyClassName="p-5">
              <div className="text-xs text-gray-400">{periodMode === "all" ? "全部结余" : periodMode === "week" ? "本周收支差额" : "本月收支差额"}</div>
              <div className={`mt-1 text-3xl ${balance >= 0 ? "text-gray-900" : "text-red-500"}`} style={{ fontWeight: 900 }}>
                ¥{formatCurrency(balance)}
              </div>
              <div className="mt-1 text-xs text-gray-400">当前周期 {periodTransactions.filter(tx => tx.status !== "void").length} 笔有效交易</div>
            </Card>
            <Card className="surface-enter [animation-delay:60ms]" bodyClassName="flex h-full flex-col justify-center p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                收入合计
              </div>
              <div className="mt-1 text-xl text-emerald-600" style={{ fontWeight: 900 }}>
                ¥{formatCurrency(incomeTotal)}
              </div>
            </Card>
            <Card className="surface-enter [animation-delay:120ms]" bodyClassName="flex h-full flex-col justify-center p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                支出合计
              </div>
              <div className="mt-1 text-xl text-red-500" style={{ fontWeight: 900 }}>
                ¥{formatCurrency(expenseTotal)}
              </div>
            </Card>
          </div>

          {/* 左右双栏：记一笔 + 收支流水 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
            {/* 左：记一笔 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:60ms]">
              <div className="mb-4 text-sm font-semibold text-gray-900">记一笔</div>
              <FundTransactionForm students={students} onSubmit={onAdd} />
            </div>

            {/* 右：收支流水 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:120ms]">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">收支流水</div>
                {periodMode === "all" && transactions.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                  >
                    清空全部
                  </button>
                )}
              </div>
              {periodTransactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  当前周期暂无交易记录
                </div>
              ) : (
                <div className="space-y-1">
                  {periodTransactions.map(tx => (
                    <div key={tx.id} className="border-b border-gray-50 last:border-b-0">
                      {editingId === tx.id ? (
                        /* 编辑态 */
                        <div className="space-y-2 bg-blue-50/40 px-3 py-3">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setEditType("income")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                editType === "income" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-500"
                              }`}
                            >
                              收入
                            </button>
                            <button
                              onClick={() => setEditType("expense")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                editType === "expense" ? "border-red-200 bg-red-50 text-red-600" : "border-gray-200 bg-white text-gray-500"
                              }`}
                            >
                              支出
                            </button>
                          </div>
                          <div className="grid grid-cols-[1fr_7rem] gap-2">
                            <input
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                              placeholder="分类"
                            />
                            <input
                              type="number"
                              value={editAmount}
                              onChange={e => setEditAmount(e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-right text-sm outline-none focus:border-blue-300"
                              placeholder="金额"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <input
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                            placeholder="说明"
                          />
                          <input
                            type="date"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId("")}
                              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 展示态 */
                        <div className={`group flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-gray-50 ${tx.status === "void" ? "opacity-50" : ""}`}>
                          {/* 图标 */}
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            tx.type === "income" ? "bg-emerald-50 text-emerald-500" : "bg-red-50 text-red-500"
                          }`}>
                            {tx.type === "income" ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                          </span>
                          {/* 内容 */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>
                                {tx.category || "未分类"}{tx.status === "void" ? "（已作废）" : ""}
                              </span>
                              {tx.note && (
                                <span className="text-xs text-gray-400">{tx.note}</span>
                              )}
                              {(tx.relatedStudentNames?.length ? tx.relatedStudentNames.join("、") : tx.relatedStudentName) && (
                                <span className="text-xs text-blue-500">@{tx.relatedStudentNames?.length ? tx.relatedStudentNames.join("、") : tx.relatedStudentName}</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-400">{tx.date}</div>
                          </div>
                          {/* 金额 */}
                          <span className={`shrink-0 text-sm font-semibold ${
                            tx.type === "income" ? "text-emerald-600" : "text-red-500"
                          }`}>
                            {tx.type === "income" ? "+" : "−"}¥{formatCurrency(tx.amount)}
                          </span>
                          {/* 操作 */}
                          {tx.status !== "void" && <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <button
                              onClick={() => startEdit(tx)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDelete(tx.id)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
