import { cx } from "@/utils/cx";
import { MENU_ITEM, MENU_ITEM_ACTIVE, MENU_POPOVER_SURFACE } from "@/components/base/dropdown/menu-styles";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { AppStudent, StudentId } from "../state/types";
import { matchesStudentSearch } from "../state/studentSearch";
import { animateSelectionTransfer } from "./selectionMotion";
import { AnimatedPopover, Input } from "./ui";

export function StudentPicker({ students, value, onChange, label = "选择学生", allowClear = false, compact = false, className = "" }: {
  students: AppStudent[];
  value: StudentId;
  onChange: (id: StudentId) => void;
  label?: string;
  allowClear?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240, maxHeight: 256 });
  const selected = students.find(student => student.id === value);
  const candidates = useMemo(() => students.filter(student => matchesStudentSearch(student, search)), [search, students]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const gap = 8;
      const roomBelow = window.innerHeight - rect.bottom - margin;
      const opensUp = roomBelow < 220 && rect.top > roomBelow;
      const maxHeight = Math.max(160, Math.min(320, Math.max(roomBelow, rect.top - margin)));
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
      const estimatedHeight = Math.min(maxHeight, 54 + Math.max(1, Math.min(candidates.length + (allowClear ? 1 : 0), 6)) * 44);
      const top = opensUp ? Math.max(margin, rect.top - estimatedHeight - gap) : Math.min(rect.bottom + gap, window.innerHeight - estimatedHeight - margin);
      setPosition({ left, top, width, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [allowClear, candidates.length, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
        setSearch("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setSearch("");
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`flex w-full items-center rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-background-primary-default text-left transition-colors hover:border-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20 ${compact ? "h-8 gap-2 px-2.5" : "h-11 gap-3 px-3"} ${className}`}>
      <span className={`grid shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-600 ${compact ? "h-6 w-6" : "h-7 w-7"}`}><UserRound className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">{!compact && <span className="block text-[10px] font-bold text-[var(--app-text-muted)]">{label}</span>}<span className={`block truncate font-bold ${compact ? "text-caption-1-regular" : "text-body-regular"} ${selected ? "text-[var(--app-text)]" : "text-text-tertiary"}`}>{selected?.name || "请选择"}</span></span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    {createPortal(<AnimatedPopover open={open} className={cx(MENU_POPOVER_SURFACE, "fixed z-[125] p-2")} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      <div ref={panelRef}>
        <Input autoFocus value={search} onChange={setSearch} leadingIcon={Search} placeholder="搜索姓名或别名" className="mb-2" />
        <div role="listbox" aria-label={label} className="max-h-64 space-y-1 overflow-y-auto">{allowClear && <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(""); setOpen(false); setSearch(""); triggerRef.current?.focus(); }} className="flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-body-regular text-text-tertiary hover:bg-[var(--app-surface-muted)]">不指定学生</button>}{candidates.map(student => <button key={student.id} type="button" role="option" aria-selected={student.id === value} onClick={() => { onChange(student.id); setOpen(false); setSearch(""); triggerRef.current?.focus(); }} className={cx(MENU_ITEM, "flex h-10 w-full items-center text-body-medium", student.id === value && MENU_ITEM_ACTIVE)}><span className="flex-1 text-left">{student.name}</span>{student.id === value && <Check className="h-4 w-4"/>}</button>)}{!candidates.length && !allowClear && <div className="py-8 text-center text-body-regular text-[var(--app-text-muted)]">没有匹配学生</div>}</div>
      </div>
    </AnimatedPopover>, document.body)}
  </>;
}

export function StudentMultiPicker({ students, values, onChange, label = "选择学生", emptyLabel = "请选择学生" }: { students: AppStudent[]; values: StudentId[]; onChange: (ids: StudentId[]) => void; label?: string; emptyLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIds = new Set(values);
  const selectedContainerRef = useRef<HTMLDivElement>(null);
  const candidatesContainerRef = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => students.filter(student => matchesStudentSearch(student, search)), [search, students]);

  function toggle(id: string) {
    onChange(selectedIds.has(id) ? values.filter(value => value !== id) : [...values, id]);
  }

  function toggleWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const isSelected = selectedIds.has(student.id);
    const selectedElement = selectedContainerRef.current
      ? Array.from(selectedContainerRef.current.querySelectorAll<HTMLElement>("[data-selection-motion-id]")).find(element => element.dataset.selectionMotionId === student.id)
      : null;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: isSelected ? selectedElement || event.currentTarget : event.currentTarget,
      sourceContainer: isSelected ? selectedContainerRef.current : candidatesContainerRef.current,
      targetContainer: isSelected ? candidatesContainerRef.current : selectedContainerRef.current,
      commit: () => toggle(student.id),
    });
  }

  function removeWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const chip = event.currentTarget.closest<HTMLElement>("[data-selection-motion-id]") || event.currentTarget;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: chip,
      sourceContainer: selectedContainerRef.current,
      targetContainer: candidatesContainerRef.current,
      commit: () => toggle(student.id),
    });
  }

  return <div className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex h-11 w-full items-center gap-3 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-background-primary-default px-3 text-left transition-colors hover:border-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-50 text-accent-600"><UserRound className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold text-[var(--app-text-muted)]">{label}</span><span className={`block truncate text-body-semibold ${values.length ? "text-[var(--app-text)]" : "text-text-tertiary"}`}>{values.length ? `已选 ${values.length} 人` : emptyLabel}</span></span>
      <ChevronDown className={`h-4 w-4 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    <div ref={selectedContainerRef} className={`flex flex-wrap gap-1.5 transition-[margin] duration-200 motion-reduce:transition-none ${values.length ? "mt-2" : ""}`}>
      {values.map(id => { const student = students.find(item => item.id === id); return student ? <span key={id} data-selection-motion-id={id} className="dorm-member-enter inline-flex items-center gap-1 rounded-full border border-accent-200 bg-accent-50 py-1 pl-2.5 pr-1 text-caption-1-semibold text-accent-700"><span>{student.name}</span><button type="button" onClick={event => removeWithAnimation(event, student)} className="grid h-5 w-5 place-items-center rounded-full text-accent-400 transition-colors hover:bg-status-danger-100 hover:text-status-danger-500" aria-label={`移除 ${student.name}`}><X className="h-3 w-3" /></button></span> : null; })}
    </div>
    <AnimatedPopover open={open} className={cx(MENU_POPOVER_SURFACE, "absolute inset-x-0 top-full z-30 mt-2 p-2")}>
      <Input value={search} onChange={setSearch} leadingIcon={Search} placeholder="搜索姓名或别名" className="mb-2" />
      <div ref={candidatesContainerRef} className="max-h-64 space-y-1 overflow-y-auto">{candidates.map(student => <button key={student.id} data-selection-motion-id={student.id} type="button" onClick={event => toggleWithAnimation(event, student)} className={cx(MENU_ITEM, "flex h-10 w-full items-center text-body-medium", selectedIds.has(student.id) && MENU_ITEM_ACTIVE)}><span className="flex-1 text-left">{student.name}</span>{selectedIds.has(student.id) ? <Check className="h-4 w-4"/> : <span className="text-[10px] font-semibold text-accent-400">加入</span>}</button>)}{!candidates.length && <div className="py-8 text-center text-body-regular text-[var(--app-text-muted)]">没有匹配学生</div>}</div>
    </AnimatedPopover>
  </div>;
}
