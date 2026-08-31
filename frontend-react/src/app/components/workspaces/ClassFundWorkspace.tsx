import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ListPlus, Pencil, RotateCcw, Trash2, TrendingDown, TrendingUp } from "lucide-react";

import { calcBalance, calcExpenseTotal, calcIncomeTotal, filterFundTransactionsByPeriod, getFundPeriodRange, shiftFundPeriod, summarizeStudentFundCollection, type FundPeriodMode, type NewFundTxInput } from "../../state/classFundActions";
import { buildCsvContent, downloadCsvFile } from "../../state/csv";
import { todayKey } from "../../state/dailyManagement";
import type { AppStudent, FundTransaction, FundTxType } from "../../state/types";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import { FundTransactionForm } from "../FundTransactionForm";
import { Button, Card, ConfirmDialog, DatePicker, IconButton, SegmentedControl, SelectMenu, useActionToast } from "../ui";
import { toLocalDateKey } from "../../state/dateKey";
import { resolveReferencedStudentNames } from "../../state/studentReferences";
import { createActivityEvent } from "../../state/activityEvents";
import type { ActivityEvent } from "../../state/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function transactionStudentLabel(tx: FundTransaction, students: AppStudent[]): string {
  return resolveReferencedStudentNames({ students, studentIds: tx.relatedStudentIds, studentId: tx.relatedStudentId, snapshotNames: tx.relatedStudentNames, snapshotName: tx.relatedStudentName }).join("、");
}

export function ClassFundWorkspace({
  transactions,
  students,
  onAdd,
  onRemoveCreated,
  onUpdate,
  onDelete,
  onClearAll,
  onRequestFollowupTask,
  onActivity,
}: {
  transactions: FundTransaction[];
  students: AppStudent[];
  onAdd: (input: NewFundTxInput) => FundTransaction;
  onRemoveCreated: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentIds">>) => void;
  onDelete: (id: string) => () => void;
  onClearAll: () => () => void;
  onRequestFollowupTask?: (draft: FollowupTaskDraft) => void;
  onActivity?: (event: ActivityEvent) => void | (() => void);
}) {
  const [editingId, setEditingId] = useState("");
  const [editType, setEditType] = useState<FundTxType>("income");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [periodMode, setPeriodMode] = useState<FundPeriodMode>("month");
  const [periodAnchor, setPeriodAnchor] = useState(() => toLocalDateKey());
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [pendingVoidTransaction, setPendingVoidTransaction] = useState<FundTransaction | null>(null);
  const [view, setView] = useState<"ledger" | "collection">("ledger");
  const [collectionCategory, setCollectionCategory] = useState("all");
  const actionToast = useActionToast();

  const periodTransactions = filterFundTransactionsByPeriod(transactions, periodMode, periodAnchor);
  const periodRange = getFundPeriodRange(periodMode, periodAnchor);
  const balance = calcBalance(periodTransactions);
  const incomeTotal = calcIncomeTotal(periodTransactions);
  const expenseTotal = calcExpenseTotal(periodTransactions);
  const periodLabel = periodRange?.label || "全部时间";

  // 收缴视图：按学生汇总当前周期内关联到该学生的有效收入。
  const activeIncome = useMemo(() => periodTransactions.filter(tx => tx.type === "income" && tx.status !== "void"), [periodTransactions]);
  const incomeCategories = useMemo(() => Array.from(new Set(activeIncome.map(tx => tx.category || "未分类"))), [activeIncome]);
  const collectionIncome = collectionCategory === "all" ? activeIncome : activeIncome.filter(tx => (tx.category || "未分类") === collectionCategory);
  const collectionRows = useMemo(() => students
    .map(student => {
      const summary = summarizeStudentFundCollection(collectionIncome, student);
      return {
        student,
        ...summary,
      };
    })
    .sort((a, b) => (a.count === 0 ? 0 : 1) - (b.count === 0 ? 0 : 1) || a.student.name.localeCompare(b.student.name, "zh-Hans-CN")), [collectionIncome, students]);
  const unpaidStudents = collectionRows.filter(row => row.count === 0).map(row => row.student);
  const collectionCategoryLabel = collectionCategory === "all" ? "关联收入" : collectionCategory;

  function exportLedgerCsv() {
    const rows = [
      ["日期", "类型", "分类", "金额", "状态", "关联学生", "说明"],
      ...periodTransactions.map(tx => [tx.date, tx.type === "income" ? "收入" : "支出", tx.category || "", tx.amount.toFixed(2), tx.status === "void" ? "已作废" : "有效", transactionStudentLabel(tx, students), tx.note || ""]),
    ];
    downloadCsvFile(`班费流水_${periodLabel.replace(/\s/g, "")}.csv`, buildCsvContent(rows));
  }

  function createUnpaidFollowups() {
    if (!onRequestFollowupTask || !unpaidStudents.length) return;
    onRequestFollowupTask({
      studentId: unpaidStudents[0].id,
      studentIds: unpaidStudents.map(student => student.id),
      studentMode: "individual",
      title: `班费收缴提醒（${collectionCategoryLabel}）`,
      type: "常规跟进",
      description: `${periodLabel}内未登记「${collectionCategoryLabel}」，请确认是否已收取并补记流水。`,
      plannedDate: todayKey(),
      dueDate: todayKey(),
      source: "manual",
    });
  }

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
    const previousTransaction = transactions.find(tx => tx.id === editingId);
    onUpdate(editingId, {
      type: editType,
      amount: Math.abs(value),
      category: editCategory,
      note: editNote,
      date: editDate,
    });
    const undoActivity = onActivity?.(createActivityEvent({ action: "updated", ref: { domain: "fund", entityId: editingId }, studentIds: previousTransaction?.relatedStudentIds || [], title: `修改班费流水：${editCategory || "未分类"}`, detail: `${editType === "income" ? "收入" : "支出"} ¥${Math.abs(value).toFixed(2)}` }));
    setEditingId("");
    actionToast.show({
      message: "班费流水修改已保存",
      actionLabel: previousTransaction ? "撤销" : undefined,
      actionIcon: previousTransaction ? <RotateCcw className="h-3.5 w-3.5" /> : undefined,
      onAction: previousTransaction ? () => { onUpdate(previousTransaction.id, { type: previousTransaction.type, amount: previousTransaction.amount, category: previousTransaction.category, note: previousTransaction.note, date: previousTransaction.date, relatedStudentIds: previousTransaction.relatedStudentIds }); if (typeof undoActivity === "function") undoActivity(); } : undefined,
      duration: 6000,
    });
  }

  function addTransaction(input: NewFundTxInput) {
    const created = onAdd(input);
    const undoActivity = onActivity?.(createActivityEvent({ action: "created", ref: { domain: "fund", entityId: created.id, studentId: created.relatedStudentIds?.[0] || created.relatedStudentId }, studentIds: created.relatedStudentIds || (created.relatedStudentId ? [created.relatedStudentId] : []), title: `新增班费流水：${created.category || "未分类"}`, detail: `${created.type === "income" ? "收入" : "支出"} ¥${created.amount.toFixed(2)}` }));
    actionToast.show({
      message: "班费流水已保存",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => { onRemoveCreated(created.id); if (typeof undoActivity === "function") undoActivity(); },
      duration: 6000,
    });
  }

  function handleClearAll() {
    if (transactions.length === 0) {
      return;
    }
    setConfirmClearAll(true);
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Card className="surface-enter" bodyClassName="flex flex-wrap items-center gap-3 p-3">
            <SegmentedControl value={periodMode} onChange={setPeriodMode} ariaLabel="班费统计周期" options={[{ value: "all", label: "全部" }, { value: "week", label: "本周" }, { value: "month", label: "本月" }]} />
            {periodMode !== "all" && <><IconButton size="sm" label="上一个周期" onClick={() => setPeriodAnchor(current => shiftFundPeriod(periodMode, current, -1))}><ChevronLeft className="h-4 w-4" /></IconButton><DatePicker value={periodAnchor} onChange={setPeriodAnchor} ariaLabel="班费统计日期" className="h-9 w-44 bg-[var(--app-surface-muted)]"/><IconButton size="sm" label="下一个周期" onClick={() => setPeriodAnchor(current => shiftFundPeriod(periodMode, current, 1))}><ChevronRight className="h-4 w-4" /></IconButton><span className="text-xs font-bold text-[var(--app-text-muted)]">{periodRange?.label}</span></>}
            <SegmentedControl className="ml-auto" value={view} onChange={value => setView(value as "ledger" | "collection")} ariaLabel="班费视图" options={[{ value: "ledger", label: "收支流水" }, { value: "collection", label: "收缴情况" }]} />
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

          {view === "collection" && (
            <Card className="surface-enter" title="收缴情况" action={
              <div className="flex items-center gap-2">
                {incomeCategories.length > 1 && <SelectMenu value={collectionCategory} onChange={value => setCollectionCategory(String(value))} ariaLabel="收缴分类" options={[{ value: "all", label: "全部收入分类" }, ...incomeCategories.map(category => ({ value: category, label: category }))]} />}
                <Button size="sm" variant="secondary" disabled={!unpaidStudents.length || !onRequestFollowupTask} onClick={createUnpaidFollowups}><ListPlus className="h-4 w-4" />为未交 {unpaidStudents.length} 人建跟进</Button>
              </div>
            }>
              {activeIncome.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  {periodLabel}内还没有登记收入。在“收支流水”页记一笔收入并关联学生后，这里会按人统计已交与未交。
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-600">已交 {collectionRows.length - unpaidStudents.length} 人</span>
                    <span className={`rounded-full px-2.5 py-1 ${unpaidStudents.length ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>未交 {unpaidStudents.length} 人</span>
                    <span className="text-[var(--app-text-muted)]">统计口径：{periodLabel} · {collectionCategoryLabel}</span>
                    <span className="text-[var(--app-text-muted)]">多人流水仅记笔数，金额不作均摊</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <div className="grid grid-cols-[minmax(6rem,1.2fr)_5rem_5rem_minmax(5rem,1fr)_minmax(6rem,1fr)] gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">
                      <span>学生</span><span>状态</span><span className="text-right">笔数</span><span className="text-right">个人金额 / 多人流水</span><span className="text-right">最近登记</span>
                    </div>
                    {collectionRows.map(row => (
                      <div key={row.student.id} className="grid grid-cols-[minmax(6rem,1.2fr)_5rem_5rem_minmax(5rem,1fr)_minmax(6rem,1fr)] items-center gap-2 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0">
                        <span className="truncate font-bold text-gray-800">{row.student.name}</span>
                        <span>{row.count ? <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600">已交</span> : <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-500">未交</span>}</span>
                        <span className="text-right tabular-nums text-gray-500">{row.count || "—"}</span>
                        <span className="text-right tabular-nums text-gray-800">{row.count
                          ? [
                              row.individualTotal > 0 ? `¥${formatCurrency(row.individualTotal)}` : "",
                              row.sharedCount > 0 ? `${row.sharedCount} 笔多人` : "",
                            ].filter(Boolean).join(" + ")
                          : "—"}</span>
                        <span className="text-right text-xs text-gray-400">{row.latest || "—"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          {/* 左右双栏：记一笔 + 收支流水 */}
          {view === "ledger" && <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
            {/* 左：记一笔 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:60ms]">
              <div className="mb-4 text-sm font-semibold text-gray-900">记一笔</div>
              <FundTransactionForm students={students} onSubmit={addTransaction} />
            </div>

            {/* 右：收支流水 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:120ms]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">收支流水</div>
                <div className="flex items-center gap-2">
                  {periodTransactions.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={exportLedgerCsv}><Download className="h-4 w-4" />导出 CSV</Button>
                  )}
                  {periodMode === "all" && transactions.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                    >
                      全部作废
                    </button>
                  )}
                </div>
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
                          <DatePicker value={editDate} onChange={setEditDate} ariaLabel="修改交易日期" className="w-full" />
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
                              {transactionStudentLabel(tx, students) && (
                                <span className="text-xs text-blue-500">@{transactionStudentLabel(tx, students)}</span>
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
                              onClick={() => setPendingVoidTransaction(tx)}
                              aria-label={`作废流水 ${tx.category}`}
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
          </div>}
        </div>
      </div>
      <ConfirmDialog open={confirmClearAll} title="作废全部班费流水？" description={`将把全部 ${transactions.length} 条交易记录标记为已作废。原金额和审计记录会保留，统计默认排除作废项；操作后可在 6 秒内撤销。`} confirmLabel="确认全部作废" onCancel={() => setConfirmClearAll(false)} onConfirm={() => {
        const undo = onClearAll();
        const activityUndos = transactions.flatMap(transaction => { const activityUndo = onActivity?.(createActivityEvent({ action: "deleted", ref: { domain: "fund", entityId: transaction.id, studentId: transaction.relatedStudentIds?.[0] || transaction.relatedStudentId }, studentIds: transaction.relatedStudentIds || (transaction.relatedStudentId ? [transaction.relatedStudentId] : []), title: `作废班费流水：${transaction.category || "未分类"}`, detail: "批量作废" })); return typeof activityUndo === "function" ? [activityUndo] : []; });
        setConfirmClearAll(false);
        actionToast.show({ message: "全部班费流水已作废", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => { undo(); activityUndos.forEach(activityUndo => activityUndo()); }, duration: 6000 });
      }} />
      <ConfirmDialog open={Boolean(pendingVoidTransaction)} title="作废这笔班费流水？" description={`“${pendingVoidTransaction?.category || "当前流水"}”将保留原金额和记录，但不再计入默认统计；操作后可在 6 秒内撤销。`} confirmLabel="确认作废" onCancel={() => setPendingVoidTransaction(null)} onConfirm={() => {
        if (!pendingVoidTransaction) return;
        const transaction = pendingVoidTransaction;
        const undo = onDelete(transaction.id);
        const undoActivity = onActivity?.(createActivityEvent({ action: "deleted", ref: { domain: "fund", entityId: transaction.id, studentId: transaction.relatedStudentIds?.[0] || transaction.relatedStudentId }, studentIds: transaction.relatedStudentIds || (transaction.relatedStudentId ? [transaction.relatedStudentId] : []), title: `作废班费流水：${transaction.category || "未分类"}`, detail: "教师手动作废" }));
        setPendingVoidTransaction(null);
        actionToast.show({ message: `班费流水“${transaction.category || "未分类"}”已作废`, actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => { undo(); if (typeof undoActivity === "function") undoActivity(); }, duration: 6000 });
      }} />
      {actionToast.toast}
    </div>
  );
}
