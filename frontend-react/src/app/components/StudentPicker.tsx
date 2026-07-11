import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AppStudent, StudentId } from "../state/types";
import { animateSelectionTransfer } from "./selectionMotion";
import { AnimatedPopover } from "./ui";

export function StudentPicker({ students, value, onChange, label = "选择学生", allowClear = false }: { students: AppStudent[]; value: StudentId; onChange: (id: StudentId) => void; label?: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = students.find(student => student.id === value);
  const candidates = useMemo(() => students.filter(student => !search.trim() || student.name.includes(search.trim()) || student.aliases.some(alias => alias.includes(search.trim()))), [search, students]);
  return <div className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex h-11 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 text-left transition-colors hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600"><UserRound className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold text-gray-400">{label}</span><span className={`block truncate text-sm font-bold ${selected ? "text-gray-800" : "text-gray-400"}`}>{selected?.name || "请选择"}</span></span>
      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <AnimatedPopover open={open} className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-[var(--app-shadow-float)]">
      <div className="relative mb-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索姓名或别名" className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300"/></div>
      <div className="max-h-64 space-y-1 overflow-y-auto">{allowClear && <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="flex h-10 w-full items-center rounded-xl px-3 text-sm text-gray-400 hover:bg-gray-50">不指定学生</button>}{candidates.map(student => <button key={student.id} type="button" onClick={() => { onChange(student.id); setOpen(false); setSearch(""); }} className={`flex h-10 w-full items-center rounded-xl px-3 text-sm transition-colors ${student.id === value ? "bg-blue-50 font-bold text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}><span className="flex-1 text-left">{student.name}</span>{student.id === value && <Check className="h-4 w-4"/>}</button>)}{!candidates.length && !allowClear && <div className="py-8 text-center text-sm text-gray-400">没有匹配学生</div>}</div>
    </AnimatedPopover>
  </div>;
}

export function StudentMultiPicker({ students, values, onChange, label = "选择学生" }: { students: AppStudent[]; values: StudentId[]; onChange: (ids: StudentId[]) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIds = new Set(values);
  const selectedContainerRef = useRef<HTMLDivElement>(null);
  const candidatesContainerRef = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => students.filter(student => !search.trim() || student.name.includes(search.trim()) || student.aliases.some(alias => alias.includes(search.trim()))), [search, students]);

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
    <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex h-11 w-full items-center gap-3 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-left transition-colors hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600"><UserRound className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold text-[var(--app-text-muted)]">{label}</span><span className={`block truncate text-sm font-bold ${values.length ? "text-[var(--app-text)]" : "text-gray-400"}`}>{values.length ? `已选 ${values.length} 人` : "请选择学生"}</span></span>
      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    <div ref={selectedContainerRef} className={`flex flex-wrap gap-1.5 transition-[margin] duration-200 motion-reduce:transition-none ${values.length ? "mt-2" : ""}`}>
      {values.map(id => { const student = students.find(item => item.id === id); return student ? <span key={id} data-selection-motion-id={id} className="dorm-member-enter inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-blue-700"><span>{student.name}</span><button type="button" onClick={event => removeWithAnimation(event, student)} className="grid h-5 w-5 place-items-center rounded-full text-blue-400 transition-colors hover:bg-red-100 hover:text-red-500" aria-label={`移除 ${student.name}`}><X className="h-3 w-3" /></button></span> : null; })}
    </div>
    <AnimatedPopover open={open} className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-2 shadow-[var(--app-shadow-float)]">
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索姓名或别名" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"/></div>
      <div ref={candidatesContainerRef} className="max-h-64 space-y-1 overflow-y-auto">{candidates.map(student => <button key={student.id} data-selection-motion-id={student.id} type="button" onClick={event => toggleWithAnimation(event, student)} className={`flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-sm transition-colors ${selectedIds.has(student.id) ? "bg-blue-50 font-bold text-blue-700" : "text-gray-700 hover:bg-[var(--app-surface-muted)]"}`}><span className="flex-1 text-left">{student.name}</span>{selectedIds.has(student.id) ? <Check className="h-4 w-4"/> : <span className="text-[10px] font-semibold text-blue-400">加入</span>}</button>)}{!candidates.length && <div className="py-8 text-center text-sm text-[var(--app-text-muted)]">没有匹配学生</div>}</div>
    </AnimatedPopover>
  </div>;
}
