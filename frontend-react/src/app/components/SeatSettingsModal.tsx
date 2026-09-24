import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight, ListOrdered, Plus, Search, Shuffle, Undo2, X } from "lucide-react";

import { COMPLEMENT_RULES } from "../state/seatPlanner";
import { matchesStudentSearch } from "../state/studentSearch";
import type { AppStudent, ComplementRuleId, SeatSettings, StudentId } from "../state/types";
import { animateSelectionTransfer } from "./selectionMotion";
import { AnimatedPopover, Button, Checkbox, IconButton, MotionCollapse, NumberStepper, SelectMenu, useModalFocus } from "./ui";

interface SeatSettingsModalProps {
  open: boolean;
  inline?: boolean;
  students: AppStudent[];
  settings: SeatSettings;
  canUndo: boolean;
  onUpdate: (updater: (current: SeatSettings) => SeatSettings) => void;
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
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-2 text-left text-body-regular outline-none focus:border-accent-300"
      >
        <span className={`truncate ${selected ? "text-text-primary" : "text-text-tertiary"}`}>{selected?.name || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && createPortal(
        <>
          {open && <button type="button" aria-label="关闭学生选择" className="fixed inset-0 z-[80] cursor-default" onClick={() => setOpen(false)} />}
          <AnimatedPopover
            open={open}
            className={`fixed z-[90] overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-xl ${popoverLayout.openUp ? "origin-bottom" : "origin-top"}`}
            style={{ left: popoverLayout.left, top: popoverLayout.top, width: popoverLayout.width }}
          >
            <div className="relative border-b border-separator-border">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索学生"
                className="w-full py-2 pl-8 pr-2 text-body-regular outline-none"
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: popoverLayout.maxHeight }}>
              {filtered.map(student => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => { onChange(student.id); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-body-regular hover:bg-accent-50"
                >
                  <span className="text-text-primary">{student.name}</span>
                  <span className="text-caption-1-regular text-text-tertiary">{student.gender || ""}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-3 text-center text-caption-1-regular text-text-tertiary">无匹配学生</div>}
            </div>
          </AnimatedPopover>
        </>,
        document.body,
      )}
    </div>
  );
}

function Section({ title, count = 0, hint, defaultOpen = true, children }: { title: string; count?: number; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="seat-rule-section" data-open={open ? "true" : "false"}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)} className="seat-rule-section__head">
        <ChevronRight aria-hidden className="seat-rule-section__chevron h-4 w-4 shrink-0 text-text-tertiary" />
        <h3 className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{title}</h3>
        {hint && <span className="shrink-0 text-caption-1-regular text-text-tertiary">{hint}</span>}
        <span key={count} aria-label={count ? `${count} 项已设置` : undefined} className="seat-rule-section__count" data-empty={count ? "false" : "true"}>{count || ""}</span>
      </button>
      <MotionCollapse open={open}><div id={bodyId} className="pb-4 pl-6 pr-1">{children}</div></MotionCollapse>
    </section>
  );
}

function ConstraintRow({ motionId, tone, children, onRemove, removeLabel }: { motionId: string; tone: "together" | "apart" | "front"; children: React.ReactNode; onRemove: (source: HTMLElement) => void; removeLabel: string }) {
  return (
    <div data-selection-motion-id={motionId} data-tone={tone} className="seat-rule-row">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <button type="button" aria-label={removeLabel} onClick={event => onRemove(event.currentTarget.parentElement || event.currentTarget)} className="seat-rule-row__remove"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export function SeatSettingsModal({ open, inline = false, students, settings, canUndo, onUpdate, onRandomize, onOrderByList, onUndo, onClose }: SeatSettingsModalProps) {
  const modalRef = useModalFocus(open && !inline, onClose);
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
  const basicCount = [settings.pairByGender, settings.keepLockedEmpty, settings.rotateWithHistory, settings.groupBalanceMode === "neighbor-and-group"].filter(Boolean).length;
  const activeCount = basicCount + settings.complementRuleIds.length + constraints.frontRowStudentIds.length + constraints.lockedDeskmatePairs.length + constraints.noDeskmatePairs.length;

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
      sourceElement: source,
      sourceContainer: source,
      targetContainer: kind === "locked" ? lockedSelectedRef.current : noSelectedRef.current,
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
      sourceElement,
      sourceContainer: kind === "locked" ? lockedSelectedRef.current : noSelectedRef.current,
      targetContainer: kind === "locked" ? lockedInputsRef.current : noInputsRef.current,
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
      sourceElement: source,
      sourceContainer: source,
      targetContainer: frontSelectedRef.current,
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
      sourceElement,
      sourceContainer: frontSelectedRef.current,
      targetContainer: frontPickerRef.current,
      commit: () => updateConstraints({ frontRowStudentIds: constraints.frontRowStudentIds.filter(item => item !== id) }),
    });
  }

  const basicRules: Array<{ label: string; checked: boolean; update: (checked: boolean) => void }> = [
    { label: "尽量男女同桌", checked: settings.pairByGender, update: checked => onUpdate(current => ({ ...current, pairByGender: checked })) },
    { label: "随机排座时保留锁定的空座", checked: settings.keepLockedEmpty, update: checked => onUpdate(current => ({ ...current, keepLockedEmpty: checked })) },
    { label: "轮换时尽量避开最近的座位和同桌", checked: settings.rotateWithHistory, update: checked => onUpdate(current => ({ ...current, rotateWithHistory: checked })) },
    { label: "同时优化整组男女与互补构成", checked: settings.groupBalanceMode === "neighbor-and-group", update: checked => onUpdate(current => ({ ...current, groupBalanceMode: checked ? "neighbor-and-group" : "off" })) },
  ];

  return (
    <div className={inline ? "flex h-full min-h-0 flex-col bg-background-primary-default" : "soft-backdrop-enter app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4"}>
      <div ref={modalRef} tabIndex={-1} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : true} aria-labelledby="seat-rules-intro" className={inline ? "flex h-full min-h-0 w-full flex-col outline-none" : "modal-panel-enter app-modal-panel flex max-h-[88vh] w-full max-w-lg flex-col outline-none"}>
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-separator-border px-4">
          <h2 id="seat-rules-intro" tabIndex={-1} className="text-body-semibold text-text-primary outline-none">排座规则</h2>
          <div className="flex items-center gap-1">
            <span key={activeCount} className="seat-rule-summary text-caption-1-regular text-text-tertiary">{activeCount ? `${activeCount} 项生效` : "未设置"}</span>
            {!inline && <IconButton label="关闭排座设置" size="sm" variant="quiet" onClick={onClose}><X className="h-4 w-4" /></IconButton>}
          </div>
        </div>

        <div className="seat-rule-scroll min-h-0 flex-1 overflow-y-auto px-3 py-1">
          <Section title="基础规则" count={basicCount}>
            <div className="space-y-2.5">
              {basicRules.map(rule => <Checkbox key={rule.label} isSelected={rule.checked} onChange={rule.update}>{rule.label}</Checkbox>)}
            </div>
          </Section>

          <Section title="互补搭配" count={settings.complementRuleIds.length}>
            <div className="flex flex-wrap gap-1.5">
              {COMPLEMENT_RULES.map(rule => {
                const active = settings.complementRuleIds.includes(rule.id);
                return (
                  <button key={rule.id} type="button" aria-pressed={active} onClick={() => toggleComplement(rule.id)} className="seat-rule-chip" data-active={active ? "true" : "false"}>
                    <span aria-hidden className="seat-rule-chip__check"><Check className="h-3 w-3" strokeWidth={3} /></span>
                    {rule.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="必须坐前排" count={constraints.frontRowStudentIds.length} defaultOpen={constraints.frontRowStudentIds.length > 0}>
            <div className="mb-2.5 flex items-center justify-between gap-3 text-body-regular text-text-secondary">
              <span>前排范围</span>
              <span className="flex items-center gap-2">前<NumberStepper value={constraints.frontRows} onChange={frontRows => updateConstraints({ frontRows })} min={0} max={20} ariaLabel="前排排数" />排</span>
            </div>
            <div className="flex gap-2">
              <StudentPicker students={students} value={frontStudentId} onChange={setFrontStudentId} placeholder="搜索并选择学生" excludeIds={constraints.frontRowStudentIds} buttonRef={frontPickerRef} />
              <IconButton label="加入必须坐前排" size="md" disabled={!frontStudentId} onClick={addFrontStudent}><Plus className="h-4 w-4" /></IconButton>
            </div>
            <div ref={frontSelectedRef} className="mt-2 flex flex-wrap gap-1.5 empty:mt-0">
              {constraints.frontRowStudentIds.map(id => (
                <span key={id} data-selection-motion-id={id} className="inline-flex items-center gap-1 rounded-full border border-border-button-default bg-background-primary-default py-1 pl-3 pr-1 text-body-medium text-text-primary">
                  {nameById.get(id) || "未知"}
                  <button type="button" aria-label={`移除 ${nameById.get(id) || "未知"}`} onClick={event => removeFrontStudent(id, event.currentTarget.parentElement || event.currentTarget)} className="seat-rule-row__remove"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </Section>

          <Section title="固定搭配" count={constraints.lockedDeskmatePairs.length} defaultOpen={constraints.lockedDeskmatePairs.length > 0}>
            <div ref={lockedInputsRef} className="grid grid-cols-2 gap-2">
              <StudentPicker students={students} value={pairA} onChange={setPairA} placeholder="学生 A" excludeIds={pairB ? [pairB] : []} />
              <StudentPicker students={students} value={pairB} onChange={setPairB} placeholder="学生 B" excludeIds={pairA ? [pairA] : []} />
              <SelectMenu value={lockedScope} onChange={value => setLockedScope(value as "neighbor" | "group")} ariaLabel="固定搭配范围" options={[{ value: "neighbor", label: "必须相邻" }, { value: "group", label: "必须同组" }]} />
              <Button variant="secondary" disabled={!pairA || !pairB || pairA === pairB} onClick={() => addPair("locked")}><Plus className="h-4 w-4" />添加</Button>
            </div>
            <div ref={lockedSelectedRef} className="mt-2 space-y-1.5 empty:mt-0">
              {constraints.lockedDeskmatePairs.map(pair => (
                <ConstraintRow key={`${pair.a}-${pair.b}`} motionId={`locked-${pair.a}-${pair.b}`} tone="together" removeLabel="移除固定搭配" onRemove={source => removePair("locked", pair.a, pair.b, source)}>
                  {nameById.get(pair.a) || "未知"} <span className="text-status-success-500">＋</span> {nameById.get(pair.b) || "未知"} <span className="text-text-tertiary">· {pair.scope === "group" ? "同组" : "相邻"}</span>
                </ConstraintRow>
              ))}
            </div>
          </Section>

          <Section title="避免搭配" count={constraints.noDeskmatePairs.length} defaultOpen={constraints.noDeskmatePairs.length > 0}>
            <div ref={noInputsRef} className="grid grid-cols-2 gap-2">
              <StudentPicker students={students} value={noPairA} onChange={setNoPairA} placeholder="学生 A" excludeIds={noPairB ? [noPairB] : []} />
              <StudentPicker students={students} value={noPairB} onChange={setNoPairB} placeholder="学生 B" excludeIds={noPairA ? [noPairA] : []} />
              <SelectMenu value={noScope} onChange={value => setNoScope(value as "neighbor" | "group")} ariaLabel="避免搭配范围" options={[{ value: "neighbor", label: "不能相邻" }, { value: "group", label: "不能同组" }]} />
              <Button variant="secondary" disabled={!noPairA || !noPairB || noPairA === noPairB} onClick={() => addPair("no")}><Plus className="h-4 w-4" />添加</Button>
            </div>
            <div ref={noSelectedRef} className="mt-2 space-y-1.5 empty:mt-0">
              {constraints.noDeskmatePairs.map(pair => (
                <ConstraintRow key={`${pair.a}-${pair.b}`} motionId={`no-${pair.a}-${pair.b}`} tone="apart" removeLabel="移除避免搭配" onRemove={source => removePair("no", pair.a, pair.b, source)}>
                  {nameById.get(pair.a) || "未知"} <span className="text-status-danger-400">✕</span> {nameById.get(pair.b) || "未知"} <span className="text-text-tertiary">· {pair.scope === "group" ? "不同组" : "不相邻"}</span>
                </ConstraintRow>
              ))}
            </div>
          </Section>
        </div>

        <div className="seat-inline-rules-footer flex shrink-0 items-center gap-2 border-t border-separator-border px-4 py-3">
          <Button size="sm" variant="quiet" onClick={() => { if (!inline) onClose(); onOrderByList(); }}><ListOrdered className="h-4 w-4" />按名单重排</Button>
          {!inline && <Button size="sm" variant="quiet" disabled={!canUndo} onClick={onUndo}><Undo2 className="h-4 w-4" />撤销</Button>}
          <Button id="seat-generate-preview" className="ml-auto" onClick={() => { if (!inline) onClose(); onRandomize(); }}><Shuffle className="h-4 w-4" />生成方案</Button>
        </div>
      </div>
    </div>
  );
}
