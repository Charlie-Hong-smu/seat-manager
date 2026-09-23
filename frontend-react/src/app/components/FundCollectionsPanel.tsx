import { useState } from "react";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { collectionBalance, money, type FundCollection } from "../state/fundCollections";
import { findOpenLinkedTask, todayKey } from "../state/dailyManagement";
import type { AppStudent, FollowupTask, FundTransaction } from "../state/types";
import type { NewFundTxInput } from "../state/classFundActions";
import type { FollowupTaskDraft } from "./FollowupTaskDrawer";
import { StudentMultiPicker } from "./StudentPicker";
import { Button, Card, DatePicker, Input, SelectMenu, ToolDrawer, useAppDialog } from "./ui";

export function FundCollectionsPanel({ collections, students, transactions, tasks, onSave, onAdd, onRequestTask, onOpenTask, initialId, onLink }: {
  onLink: (id: string, collectionId: string) => void;
  initialId?: string;
  collections: FundCollection[]; students: AppStudent[]; transactions: FundTransaction[]; tasks: FollowupTask[];
  onSave: (value: FundCollection) => void; onAdd: (input: NewFundTxInput) => void;
  onRequestTask?: (input: FollowupTaskDraft) => void; onOpenTask?: (id: string) => void;
}) {
  const dialog = useAppDialog();
  const [linkStudent, setLinkStudent] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(initialId || "");
  const [title, setTitle] = useWorkspaceDraftState("fund:collection:title", "");
  const [amount, setAmount] = useWorkspaceDraftState("fund:collection:amount", "");
  const [ids, setIds] = useWorkspaceDraftState<string[]>("fund:collection:students", []);
  const [dueDate, setDueDate] = useWorkspaceDraftState("fund:collection:due", todayKey());
  const collection = collections.find(item => item.id === selectedId) || collections[0];
  const rows = collection ? Object.keys(collection.targets).map(studentId => ({ studentId, ...collectionBalance(collection, studentId, transactions) })) : [];
  const activeIds = new Set(students.map(student => student.id));

  function create() {
    const value = money(Number(amount));
    const members = ids.filter(id => activeIds.has(id));
    if (!title.trim() || !Number.isFinite(value) || value <= 0 || !members.length) return;
    const next: FundCollection = { id: `collection-${crypto.randomUUID()}`, title: title.trim(), dueDate, createdAt: new Date().toISOString(), targets: Object.fromEntries(members.map(id => [id, value])), studentNames: Object.fromEntries(students.filter(student => members.includes(student.id)).map(student => [student.id, student.name])) };
    onSave(next); setSelectedId(next.id); setCreating(false); setTitle(""); setAmount(""); setIds([]);
  }
  async function payment(studentId: string, refund = false) {
    if (!collection) return;
    const balance = collectionBalance(collection, studentId, transactions);
    const entered = await dialog.prompt({ title: `${refund ? "登记退款" : "登记收款"}：${collection.studentNames[studentId] || "学生"}`, description: collection.title, inputLabel: "金额（元）", defaultValue: String(refund ? Math.max(0, balance.paid) : balance.remaining), confirmLabel: "保存流水" });
    if (entered === null) return;
    const value = money(Number(entered));
    if (!Number.isFinite(value) || value <= 0 || refund && value > balance.paid || !refund && value > balance.remaining) { await dialog.notice({ title: "金额无效", description: refund ? "退款金额须大于零且不能超过实收金额。" : "收款金额须大于零且不能超过尚欠金额；如应交额有变化，请先调整。" }); return; }
    onAdd({ collectionId: collection.id, type: refund ? "expense" : "income", amount: value, category: collection.title, note: refund ? "收费事项退款" : "收费事项收款", date: todayKey(), relatedStudentIds: [studentId] });
  }
  async function adjust(studentId: string) {
    if (!collection) return;
    const entered = await dialog.prompt({ title: "调整个人应交金额", description: "填写 0 表示免交；已登记流水会保留。", inputLabel: "应交金额（元）", defaultValue: String(collection.targets[studentId]), confirmLabel: "下一步" });
    if (entered === null || !entered.trim() || !Number.isFinite(Number(entered)) || Number(entered) < 0) return;
    const reason = await dialog.prompt({ title: "调整说明", description: "记录减免或金额调整原因。", inputLabel: "调整原因", confirmLabel: "保存调整" });
    if (reason === null) return;
    if (!reason.trim()) { await dialog.notice({ title: "请填写调整说明", description: "减免或修改应交金额需要留下原因，方便日后核对。" }); return; }
    onSave({ ...collection, targets: { ...collection.targets, [studentId]: money(Number(entered)) }, adjustmentNotes: { ...collection.adjustmentNotes, [studentId]: reason.trim() } });
  }
  function remind(studentIds: string[]) {
    if (!collection || !studentIds.length) return;
    onRequestTask?.({ studentId: studentIds[0], studentIds, studentMode: "individual", title: `班费收缴：${collection.title}`, type: "常规跟进", description: "核对本事项的应交与实收，收到款后补记流水并处理此任务。", plannedDate: todayKey(), dueDate: collection.dueDate, source: "manual", sourceRef: { domain: "fund", entityId: collection.id } });
  }
  function eligiblePayments(studentId: string, remaining: number) {
    return transactions.filter(tx => !tx.collectionId && tx.type === "income" && tx.status !== "void" && tx.amount <= remaining
      && (tx.relatedStudentIds?.length === 1 ? tx.relatedStudentIds[0] === studentId : !tx.relatedStudentIds?.length && tx.relatedStudentId === studentId));
  }
  return <>
    <Card title="收费事项" action={<Button size="sm" onClick={() => setCreating(true)}>新建收费事项</Button>}>
      <p className="mb-3 text-caption-1-regular text-text-secondary">按事项核对应交与实收，历史流水不会自动分摊给学生。</p>
      {collection ? <div className="space-y-4">
        <SelectMenu ariaLabel="收费事项" value={collection.id} onChange={value => setSelectedId(String(value))} options={collections.map(item => ({ value: item.id, label: `${item.title}${item.closedAt ? " · 已结束" : ""}` }))}/>
        <div className="flex flex-wrap items-center gap-2 text-body-regular">
          <span>截止：{collection.dueDate || "未设置"} · 待收 ¥{money(rows.reduce((sum, row) => sum + row.remaining, 0)).toFixed(2)}</span>
          <Button size="sm" variant="secondary" onClick={() => onSave({ ...collection, closedAt: collection.closedAt ? undefined : new Date().toISOString() })}>{collection.closedAt ? "重新开放" : "结束收缴"}</Button>
          <Button size="sm" variant="secondary" disabled={Boolean(collection.closedAt) || !rows.some(row => row.remaining > 0 && activeIds.has(row.studentId))} onClick={() => remind(rows.filter(row => row.remaining > 0 && activeIds.has(row.studentId)).map(row => row.studentId))}>为未交齐学生建跟进</Button>
        </div>
        <div className="divide-y divide-separator-border">{rows.map(row => {
          const task = findOpenLinkedTask(tasks, row.studentId, { domain: "fund", entityId: collection.id });
          const active = activeIds.has(row.studentId);
          const available = eligiblePayments(row.studentId, row.remaining);
          return <div key={row.studentId} data-fund-collection-student-id={row.studentId} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-40 flex-1">
              <strong className="text-body-medium text-text-primary">{students.find(student => student.id === row.studentId)?.name || collection.studentNames[row.studentId] || "已移出学生"}</strong>
              <p className="text-caption-1-regular text-text-secondary">{row.status} · 应交 ¥{row.target.toFixed(2)} · 实收 ¥{row.paid.toFixed(2)}{!active ? " · 已移出班级" : ""}</p>
              {collection.adjustmentNotes?.[row.studentId] && <p className="text-caption-1-regular text-text-secondary">调整说明：{collection.adjustmentNotes[row.studentId]}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!active || Boolean(collection.closedAt) || row.remaining <= 0} onClick={() => void payment(row.studentId)}>登记收款</Button>
              {available.length > 0 && !collection.closedAt && <Button size="sm" variant="ghost" onClick={() => setLinkStudent(linkStudent === row.studentId ? "" : row.studentId)}>关联已有流水</Button>}
              {linkStudent === row.studentId && <SelectMenu ariaLabel="选择已有流水" value="" options={[{ value: "", label: "请选择流水" }, ...available.map(tx => ({ value: tx.id, label: `${tx.date} · 收入 ¥${tx.amount.toFixed(2)} · ${tx.category}` }))]} onChange={value => { if (value) { onLink(String(value), collection.id); setLinkStudent(""); } }}/>}
              <Button size="sm" variant="ghost" disabled={!active || row.paid <= 0} onClick={() => void payment(row.studentId, true)}>退款</Button>
              <Button size="sm" variant="ghost" disabled={!active || Boolean(collection.closedAt)} onClick={() => void adjust(row.studentId)}>应交 / 减免</Button>
              {task ? <Button size="sm" variant="secondary" onClick={() => onOpenTask?.(task.id)}>{row.remaining === 0 ? "已交齐，处理跟进" : "查看跟进"}</Button> : row.remaining > 0 && !collection.closedAt && active && <Button size="sm" variant="ghost" onClick={() => remind([row.studentId])}>建跟进</Button>}
            </div>
          </div>;
        })}</div>
      </div> : <p className="py-8 text-center text-body-regular text-text-secondary">新建收费事项，设置应交金额和参与学生后开始登记。</p>}
    </Card>
    <ToolDrawer open={creating} title="新建收费事项" onClose={() => setCreating(false)}>
      <div className="space-y-4">
        <Input aria-label="收费事项名称" placeholder="例如：秋季班费" value={title} onChange={setTitle}/>
        <Input aria-label="每人应交金额" placeholder="每人应交金额（元）" value={amount} onChange={setAmount}/>
        <DatePicker value={dueDate} onChange={setDueDate} ariaLabel="收缴截止日期"/>
        <Button size="sm" variant="secondary" onClick={() => setIds(students.map(student => student.id))}>选择全班</Button>
        <StudentMultiPicker students={students} values={ids} onChange={setIds} label="参与学生" emptyLabel="请选择学生"/>
        <Button disabled={!title.trim() || !ids.length || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={create}>创建收费事项</Button>
      </div>
    </ToolDrawer>
    {dialog.dialog}
  </>;
}
