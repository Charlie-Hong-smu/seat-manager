import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, RotateCcw, Search, Shuffle, Undo2, X } from "lucide-react";

import { COMPLEMENT_RULES } from "../state/seatPlanner";
import { matchesStudentSearch } from "../state/studentSearch";
import type { AppStudent, ComplementRuleId, SeatLayoutV1, SeatSettings, StudentId } from "../state/types";
import { animateSelectionTransfer } from "./selectionMotion";
import { SeatLayoutDesigner } from "./SeatLayoutDesigner";
import { AnimatedPopover, SegmentedControl, SelectMenu, useModalFocus } from "./ui";

interface SeatSettingsModalProps {
  open: boolean;
  students: AppStudent[];
  settings: SeatSettings;
  canUndo: boolean;
  onUpdate: (updater: (current: SeatSettings) => SeatSettings) => void;
  seatCount: number;
  onApplyLayout: (layout: SeatLayoutV1) => void;
  onRandomize: () => void;
  onOrderByList: () => void;
  onUndo: () => void;
  onClose: () => void;
}

/** 可搜索的单选学生下拉。 */
function StudentPicker({ students, value, onChange, placeholder, excludeIds, buttonRef }: {
  students: AppStudent[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  excludeIds?: string[];
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = buttonRef || localTriggerRef;
  const searchRef = useRef<HTMLInputElement>(null);
  const [popoverLayout, setPopoverLayout] = useState({ left: 0, top: 0, width: 240, maxHeight: 176, openUp: false });
  const selected = students.find(student => student.id === value);
  const exclude = new Set(excludeIds || []);
  const filtered = students
    .filter(student => !exclude.has(student.id))
    .filter(student => matchesStudentSearch(student, query))
    .slice(0, 60);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const gap = 5;
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const openUp = below < 220 && above > below;
      const available = openUp ? above : below;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
      const panelHeight = Math.min(256, Math.max(120, available - gap));

      setPopoverLayout({
        left,
        top: openUp ? rect.top - panelHeight - gap : rect.bottom + gap,
        width,
        maxHeight: Math.max(72, panelHeight - 41),
        openUp,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left text-sm outline-none focus:border-blue-300"
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>{selected?.name || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && createPortal(
        <>
          {open && <button type="button" aria-label="关闭学生选择" className="fixed inset-0 z-[80] cursor-default" onClick={() => setOpen(false)} />}
          <AnimatedPopover
            open={open}
            className={`fixed z-[90] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl ${popoverLayout.openUp ? "origin-bottom" : "origin-top"}`}
            style={{ left: popoverLayout.left, top: popoverLayout.top, width: popoverLayout.width }}
          >
            <div className="relative border-b border-gray-100">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索学生"
                className="w-full py-2 pl-8 pr-2 text-sm outline-none"
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: popoverLayout.maxHeight }}>
              {filtered.map(student => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => { onChange(student.id); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-blue-50"
                >
                  <span className="text-gray-700">{student.name}</span>
                  <span className="text-xs text-gray-400">{student.gender || ""}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-3 text-center text-xs text-gray-400">无匹配学生</div>}
            </div>
          </AnimatedPopover>
        </>,
        document.body,
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface-enter rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function SeatSettingsModal({ open, students, settings, seatCount, canUndo, onUpdate, onApplyLayout, onRandomize, onOrderByList, onUndo, onClose }: SeatSettingsModalProps) {
  const modalRef = useModalFocus(open, onClose);
  const [tab, setTab] = useState<"layout" | "rules">("rules");
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [noPairA, setNoPairA] = useState("");
  const [noPairB, setNoPairB] = useState("");
  const [lockedScope, setLockedScope] = useState<"neighbor" | "group">("neighbor");
  const [noScope, setNoScope] = useState<"neighbor" | "group">("neighbor");
  const [frontStudentId, setFrontStudentId] = useState("");
  const frontPickerRef = useRef<HTMLButtonElement>(null);
  const frontSelectedRef = useRef<HTMLDivElement>(null);
  const lockedInputsRef = useRef<HTMLDivElement>(null);
  const lockedSelectedRef = useRef<HTMLDivElement>(null);
  const noInputsRef = useRef<HTMLDivElement>(null);
  const noSelectedRef = useRef<HTMLDivElement>(null);
  const nameById = useMemo(() => new Map(students.map(student => [student.id, student.name])), [students]);

  if (!open) {
    return null;
  }

  const constraints = settings.constraints;

  function toggleComplement(id: ComplementRuleId) {
    onUpdate(current => {
      const has = current.complementRuleIds.includes(id);
      return {
        ...current,
        complementRuleIds: has ? current.complementRuleIds.filter(item => item !== id) : [...current.complementRuleIds, id],
      };
    });
  }

  function updateConstraints(patch: Partial<SeatSettings["constraints"]>) {
    onUpdate(current => ({ ...current, constraints: { ...current.constraints, ...patch } }));
  }

  function addPair(kind: "locked" | "no") {
    const a = kind === "locked" ? pairA : noPairA;
    const b = kind === "locked" ? pairB : noPairB;
    const scope = kind === "locked" ? lockedScope : noScope;
    if (!a || !b || a === b) return;
    const source = kind === "locked" ? lockedInputsRef.current : noInputsRef.current;
    if (!source) return;
    const itemId = `${kind}-${a}-${b}`;
    animateSelectionTransfer({
      itemId,
      itemName: `${nameById.get(a) || "未知"} ${kind === "locked" ? "＋" : "✕"} ${nameById.get(b) || "未知"}`,
      sourceElement: source,
      sourceContainer: source,
      targetContainer: kind === "locked" ? lockedSelectedRef.current : noSelectedRef.current,
      tone: "indigo",
      commit: () => {
        onUpdate(current => {
          const key = kind === "locked" ? "lockedDeskmatePairs" : "noDeskmatePairs";
          const exists = current.constraints[key].some(pair => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a));
          if (exists) return current;
          return { ...current, constraints: { ...current.constraints, [key]: [...current.constraints[key], { a, b, scope: scope === "group" ? "group" : undefined }] } };
        });
        if (kind === "locked") { setPairA(""); setPairB(""); } else { setNoPairA(""); setNoPairB(""); }
      },
    });
  }

  function removePair(kind: "locked" | "no", a: StudentId, b: StudentId, sourceElement: HTMLElement) {
    animateSelectionTransfer({
      itemId: `${kind}-${a}-${b}`,
      itemName: `${nameById.get(a) || "未知"} ${kind === "locked" ? "＋" : "✕"} ${nameById.get(b) || "未知"}`,
      sourceElement,
      sourceContainer: kind === "locked" ? lockedSelectedRef.current : noSelectedRef.current,
      targetContainer: kind === "locked" ? lockedInputsRef.current : noInputsRef.current,
      tone: "indigo",
      commit: () => onUpdate(current => {
        const key = kind === "locked" ? "lockedDeskmatePairs" : "noDeskmatePairs";
        return { ...current, constraints: { ...current.constraints, [key]: current.constraints[key].filter(pair => !(pair.a === a && pair.b === b)) } };
      }),
    });
  }

  function addFrontStudent() {
    if (!frontStudentId) return;
    const source = frontPickerRef.current;
    if (!source) return;
    const id = frontStudentId;
    animateSelectionTransfer({
      itemId: id,
      itemName: nameById.get(id) || "未知",
      sourceElement: source,
      sourceContainer: source,
      targetContainer: frontSelectedRef.current,
      tone: "blue",
      commit: () => {
        onUpdate(current => {
          if (current.constraints.frontRowStudentIds.includes(id)) return current;
          return { ...current, constraints: { ...current.constraints, frontRowStudentIds: [...current.constraints.frontRowStudentIds, id] } };
        });
        setFrontStudentId("");
      },
    });
  }

  function removeFrontStudent(id: StudentId, sourceElement: HTMLElement) {
    animateSelectionTransfer({
      itemId: id,
      itemName: nameById.get(id) || "未知",
      sourceElement,
      sourceContainer: frontSelectedRef.current,
      targetContainer: frontPickerRef.current,
      tone: "blue",
      commit: () => updateConstraints({ frontRowStudentIds: constraints.frontRowStudentIds.filter(item => item !== id) }),
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4">
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="seat-settings-title" className={`modal-panel-enter flex max-h-[88vh] w-full flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl outline-none ${tab === "layout" ? "max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="seat-settings-title" className="text-base font-bold text-gray-900">排座</h2>
          </div>
          <button type="button" aria-label="关闭排座设置" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3"><SegmentedControl value={tab} onChange={value => setTab(value as "layout" | "rules")} ariaLabel="排座设置分类" options={[{ value: "rules", label: "排座规则" }, { value: "layout", label: "布局设计" }]} /></div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {tab === "layout" ? <SeatLayoutDesigner current={settings.layout} seatCount={seatCount} onApply={onApplyLayout} /> : <>
          <Section title="基础规则">
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={settings.pairByGender} onChange={e => onUpdate(c => ({ ...c, pairByGender: e.target.checked }))} className="accent-blue-600" />
                尽量男女同桌
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={settings.keepLockedEmpty} onChange={e => onUpdate(c => ({ ...c, keepLockedEmpty: e.target.checked }))} className="accent-blue-600" />
                随机排座时保留锁定的空座
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={settings.groupBalanceMode === "neighbor-and-group"} onChange={e => onUpdate(current => ({ ...current, groupBalanceMode: e.target.checked ? "neighbor-and-group" : "off" }))} className="accent-blue-600" />
                同时优化整组男女与互补构成
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                <span>前排排数（用于"必须前排"）</span>
                <input type="number" min={0} max={20} value={constraints.frontRows} onChange={e => updateConstraints({ frontRows: Math.max(0, Number(e.target.value) || 0) })} className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-blue-300" />
              </label>
            </div>
          </Section>

          <Section title="互补搭配">
            <div className="grid grid-cols-2 gap-2">
              {COMPLEMENT_RULES.map(rule => {
                const active = settings.complementRuleIds.includes(rule.id);
                return (
                  <button key={rule.id} onClick={() => toggleComplement(rule.id)} className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-[background,border-color,color,transform] active:scale-95 ${active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/40"}`}>
                    {rule.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="必须坐前排" hint={`前 ${constraints.frontRows} 排`}>
            <div className="flex gap-2">
              <StudentPicker students={students} value={frontStudentId} onChange={setFrontStudentId} placeholder="搜索并选择学生" excludeIds={constraints.frontRowStudentIds} buttonRef={frontPickerRef} />
              <button onClick={addFrontStudent} disabled={!frontStudentId} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" /></button>
            </div>
            {constraints.frontRowStudentIds.length > 0 && (
              <div ref={frontSelectedRef} className="mt-2 flex flex-wrap gap-2">
                {constraints.frontRowStudentIds.map(id => (
                  <span key={id} data-selection-motion-id={id} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 py-1 pl-3 pr-1.5 text-sm font-semibold text-blue-700">
                    {nameById.get(id) || "未知"}
                    <button onClick={event => removeFrontStudent(id, event.currentTarget.parentElement || event.currentTarget)} className="grid h-4 w-4 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title="固定搭配">
            <div ref={lockedInputsRef} className="grid grid-cols-2 gap-2">
              <StudentPicker students={students} value={pairA} onChange={setPairA} placeholder="学生 A" excludeIds={pairB ? [pairB] : []} />
              <StudentPicker students={students} value={pairB} onChange={setPairB} placeholder="学生 B" excludeIds={pairA ? [pairA] : []} />
              <SelectMenu value={lockedScope} onChange={value => setLockedScope(value as "neighbor" | "group")} ariaLabel="固定搭配范围" options={[{ value: "neighbor", label: "必须相邻" }, { value: "group", label: "必须同组" }]} />
              <button onClick={() => addPair("locked")} disabled={!pairA || !pairB || pairA === pairB} className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" />添加</button>
            </div>
            <div ref={lockedSelectedRef} className="mt-2 space-y-1.5">
              {constraints.lockedDeskmatePairs.map(pair => (
                <div key={`${pair.a}-${pair.b}`} data-selection-motion-id={`locked-${pair.a}-${pair.b}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-sm">
                  <span className="text-gray-700">{nameById.get(pair.a) || "未知"} <span className="text-emerald-500">＋</span> {nameById.get(pair.b) || "未知"} · {pair.scope === "group" ? "同组" : "相邻"}</span>
                  <button onClick={event => removePair("locked", pair.a, pair.b, event.currentTarget.parentElement || event.currentTarget)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="避免搭配">
            <div ref={noInputsRef} className="grid grid-cols-2 gap-2">
              <StudentPicker students={students} value={noPairA} onChange={setNoPairA} placeholder="学生 A" excludeIds={noPairB ? [noPairB] : []} />
              <StudentPicker students={students} value={noPairB} onChange={setNoPairB} placeholder="学生 B" excludeIds={noPairA ? [noPairA] : []} />
              <SelectMenu value={noScope} onChange={value => setNoScope(value as "neighbor" | "group")} ariaLabel="避免搭配范围" options={[{ value: "neighbor", label: "不能相邻" }, { value: "group", label: "不能同组" }]} />
              <button onClick={() => addPair("no")} disabled={!noPairA || !noPairB || noPairA === noPairB} className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" />添加</button>
            </div>
            <div ref={noSelectedRef} className="mt-2 space-y-1.5">
              {constraints.noDeskmatePairs.map(pair => (
                <div key={`${pair.a}-${pair.b}`} data-selection-motion-id={`no-${pair.a}-${pair.b}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-sm">
                  <span className="text-gray-700">{nameById.get(pair.a) || "未知"} <span className="text-red-400">✕</span> {nameById.get(pair.b) || "未知"} · {pair.scope === "group" ? "不同组" : "不相邻"}</span>
                  <button onClick={event => removePair("no", pair.a, pair.b, event.currentTarget.parentElement || event.currentTarget)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Section>
          </>}
        </div>

        {tab === "rules" && <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={() => { onClose(); onRandomize(); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Shuffle className="h-4 w-4" />随机排座
          </button>
          <button onClick={() => { onClose(); onOrderByList(); }} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <RotateCcw className="h-4 w-4" />名单顺序
          </button>
          <button onClick={onUndo} disabled={!canUndo} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-300">
            <Undo2 className="h-4 w-4" />撤销
          </button>
        </div>}
      </div>
    </div>
  );
}
