import { useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import {
  getChangedSeatIndices,
  getSeatPositionLabel,
  getSeatPreviewStats,
  type SeatEvaluation,
  type ShuffleCandidate,
} from "../state/seatPlanner";
import type { AppStudent, SeatSettings, StudentId } from "../state/types";

const COLS = 8;

interface Props {
  students: AppStudent[];
  currentOrder: Array<StudentId | null>;
  candidate: ShuffleCandidate;
  seatSettings: SeatSettings;
  onOrderChange: (order: Array<StudentId | null>) => void;
  onRegenerate: () => void;
  onApply: () => void;
  onClose: () => void;
}

type DetailTab = "changed" | "required" | "gender" | "complement" | "front";

function PreviewStat({ active, label, value, onClick }: { active: boolean; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
        active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-100 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span className="block text-xs opacity-70" style={{ fontWeight: 700 }}>{label}</span>
      <strong className="block mt-1 text-sm">{value}</strong>
    </button>
  );
}

function DetailItem({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "muted" }) {
  const className = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warn: "bg-amber-50 text-amber-700 border-amber-100",
    muted: "bg-gray-50 text-gray-500 border-gray-100",
  }[tone];
  return <div className={`rounded-xl border px-3 py-2 text-xs ${className}`}>{children}</div>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400" style={{ fontWeight: 800 }}>{title}</div>
      {children}
    </div>
  );
}

function renderRequiredDetails(evaluation: SeatEvaluation) {
  const satisfied = evaluation.details.required.filter(item => item.satisfied);
  const unmet = evaluation.details.required.filter(item => !item.satisfied);
  return (
    <>
      <DetailBlock title="已满足的明确要求">
        {satisfied.length ? satisfied.map(item => (
          <DetailItem key={`${item.type}-${item.label}`} tone="ok">{item.label}（{item.seats.join("、")}）</DetailItem>
        )) : <DetailItem>暂无明确要求。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="未满足的明确要求">
        {unmet.length ? unmet.map(item => (
          <DetailItem key={`${item.type}-${item.label}`} tone="warn">{item.label}（当前：{item.seats.join("、")}）</DetailItem>
        )) : <DetailItem tone="ok">明确要求都已满足。</DetailItem>}
      </DetailBlock>
    </>
  );
}

function renderGenderDetails(evaluation: SeatEvaluation, pairByGender: boolean) {
  const { mixed, same, unknown } = evaluation.details.gender;
  return (
    <>
      <DetailBlock title="男女同桌">
        {mixed.length ? mixed.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`} tone="ok">{item.leftName} - {item.rightName}：{item.leftGender} + {item.rightGender}</DetailItem>
        )) : <DetailItem>暂未形成男女同桌。</DetailItem>}
      </DetailBlock>
      <DetailBlock title={pairByGender ? "还没做到的同桌" : "同性别同桌"}>
        {same.length ? same.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`} tone={pairByGender ? "warn" : "muted"}>{item.leftName} - {item.rightName}：{item.leftGender} + {item.rightGender}</DetailItem>
        )) : <DetailItem tone="ok">没有同性别同桌。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="无法判断的同桌">
        {unknown.length ? unknown.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`}>{item.leftName} - {item.rightName}：性别未完整填写</DetailItem>
        )) : <DetailItem tone="ok">没有性别未知的同桌。</DetailItem>}
      </DetailBlock>
    </>
  );
}

function renderComplementDetails(evaluation: SeatEvaluation) {
  if (!evaluation.complementEnabled) {
    return <DetailItem>未勾选互补关系；如需强弱/性格互补，请在排座要求中勾选。</DetailItem>;
  }
  if (!evaluation.details.complement.length) {
    return <DetailItem>本次没有形成明显互补同桌。</DetailItem>;
  }
  const byRule = new Map<string, React.ReactNode[]>();
  evaluation.details.complement.forEach(item => {
    item.matches.forEach(match => {
      const list = byRule.get(match.ruleLabel) || [];
      list.push(
        <DetailItem key={`${item.leftId}-${item.rightId}-${match.ruleId}`} tone="ok">
          {item.leftName} - {item.rightName}（{item.leftSeat}、{item.rightSeat}）：{match.reason}
        </DetailItem>
      );
      byRule.set(match.ruleLabel, list);
    });
  });
  return [...byRule.entries()].map(([rule, items]) => (
    <DetailBlock key={rule} title={rule}>{items}</DetailBlock>
  ));
}

function renderFrontDetails(evaluation: SeatEvaluation) {
  const satisfied = evaluation.details.front.filter(item => item.satisfied);
  const unmet = evaluation.details.front.filter(item => !item.satisfied);
  return (
    <>
      <DetailBlock title="已坐到前排">
        {satisfied.length ? satisfied.map(item => (
          <DetailItem key={item.label} tone="ok">{item.label}：当前 {item.seats[0]}</DetailItem>
        )) : <DetailItem>暂无前排照顾学生。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="还未坐到前排">
        {unmet.length ? unmet.map(item => (
          <DetailItem key={item.label} tone="warn">{item.label}：当前第 {item.currentRow} 排</DetailItem>
        )) : <DetailItem tone="ok">前排照顾都已满足。</DetailItem>}
      </DetailBlock>
    </>
  );
}

export function SeatShufflePreview({ students, currentOrder, candidate, seatSettings, onOrderChange, onRegenerate, onApply, onClose }: Props) {
  const [activeDetail, setActiveDetail] = useState<DetailTab>("required");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const stats = getSeatPreviewStats(students, currentOrder, candidate.order, candidate.evaluation, seatSettings);
  const rows = Math.ceil(candidate.order.length / COLS);
  const changedSet = new Set(getChangedSeatIndices(currentOrder, candidate.order));

  function swapSeats(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      return;
    }
    const next = [...candidate.order];
    const source = next[dragIndex] ?? null;
    next[dragIndex] = next[targetIndex] ?? null;
    next[targetIndex] = source;
    setDragIndex(null);
    onOrderChange(next);
  }

  const statCards: Array<[DetailTab, string, string]> = [
    ["changed", "变动座位", `${stats.changedCount} 个`],
    ["required", "明确要求", stats.requiredTotal ? `${stats.requiredSatisfied}/${stats.requiredTotal} 条已满足` : "未设置"],
    ["gender", "男女搭配", `${stats.mixedGenderPairs}/${stats.occupiedPairs} 对`],
    ["complement", "互补关系", stats.complementEnabled ? `互补同桌 ${stats.complementMatchedCount} 对` : "未启用"],
    ["front", "前排要求", stats.frontTotal ? `${stats.frontSatisfied}/${stats.frontTotal} 人` : "无"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-white overflow-hidden flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="text-xs text-blue-500 mb-1" style={{ fontWeight: 800 }}>座位调整</div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 800 }}>随机排座预览</h3>
            <p className="text-sm text-gray-400 mt-1">可拖动交换座位，采用前不会影响当前座位。</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors" aria-label="关闭预览">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_19rem] gap-4 p-5 overflow-auto bg-gray-50">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
            <div className="grid gap-2 min-w-[760px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {Array.from({ length: rows }).map((_, row) => (
                <div key={`row-${row}`} className="col-span-8 grid gap-2 items-center" style={{ gridTemplateColumns: `3.25rem repeat(${COLS}, minmax(0, 1fr))` }}>
                  <div className="text-xs text-gray-400 text-right pr-1" style={{ fontWeight: 700 }}>第{row + 1}排</div>
                  {Array.from({ length: COLS }).map((__, col) => {
                    const index = row * COLS + col;
                    const studentId = candidate.order[index] ?? null;
                    const student = studentId ? studentById.get(studentId) : null;
                    const genderColor = student?.gender === "男" ? "bg-blue-400" : student?.gender === "女" ? "bg-pink-400" : "bg-gray-300";
                    return (
                      <button
                        key={index}
                        type="button"
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={event => event.preventDefault()}
                        onDrop={() => swapSeats(index)}
                        onDragEnd={() => setDragIndex(null)}
                        className={`h-12 rounded-xl border px-2 text-left transition-colors ${
                          student ? "bg-white border-gray-200 hover:border-blue-200" : "bg-gray-50 border-dashed border-gray-200 text-gray-300"
                        } ${changedSet.has(index) ? "ring-2 ring-blue-100" : ""} ${dragIndex === index ? "opacity-50" : ""}`}
                        title={getSeatPositionLabel(index)}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${genderColor}`} />
                          <span className="truncate text-sm text-gray-800" style={{ fontWeight: 700 }}>{student?.name || "空"}</span>
                        </span>
                        <span className="block text-[10px] text-gray-300 mt-0.5">{row + 1}-{col + 1}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {statCards.map(([key, label, value]) => (
                <PreviewStat key={key} active={activeDetail === key} label={label} value={value} onClick={() => setActiveDetail(key)} />
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4 max-h-[23rem] overflow-y-auto">
              {activeDetail === "changed" && (
                <DetailBlock title="发生变化的座位">
                  {stats.changedCount ? getChangedSeatIndices(currentOrder, candidate.order).map(index => {
                    const before = currentOrder[index] ? studentById.get(currentOrder[index] as StudentId)?.name || "未知" : "空";
                    const after = candidate.order[index] ? studentById.get(candidate.order[index] as StudentId)?.name || "未知" : "空";
                    return <DetailItem key={index}>{getSeatPositionLabel(index)}：{before} → {after}</DetailItem>;
                  }) : <DetailItem>本次方案和当前座位完全一致。</DetailItem>}
                </DetailBlock>
              )}
              {activeDetail === "required" && renderRequiredDetails(candidate.evaluation)}
              {activeDetail === "gender" && renderGenderDetails(candidate.evaluation, seatSettings.pairByGender)}
              {activeDetail === "complement" && renderComplementDetails(candidate.evaluation)}
              {activeDetail === "front" && renderFrontDetails(candidate.evaluation)}
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-white">
          <button onClick={onRegenerate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm" style={{ fontWeight: 700 }}>
            <RefreshCw className="w-3.5 h-3.5" />再随机一次
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm" style={{ fontWeight: 700 }}>取消</button>
          <button onClick={onApply} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm" style={{ fontWeight: 800 }}>采用方案</button>
        </div>
      </div>
    </div>
  );
}
