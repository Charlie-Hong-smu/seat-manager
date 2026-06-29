import { useMemo, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Search, Shuffle, Undo2, X } from "lucide-react";

import { COMPLEMENT_RULES } from "../state/seatPlanner";
import type { AppStudent, ComplementRuleId, SeatSettings, StudentId } from "../state/types";

interface SeatSettingsModalProps {
  open: boolean;
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
function StudentPicker({ students, value, onChange, placeholder, excludeIds }: {
  students: AppStudent[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = students.find(student => student.id === value);
  const exclude = new Set(excludeIds || []);
  const filtered = students
    .filter(student => !exclude.has(student.id))
    .filter(student => !query || student.name.includes(query) || student.aliases.some(alias => alias.includes(query)))
    .slice(0, 60);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left text-sm outline-none focus:border-blue-300"
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>{selected?.name || placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg">
            <div className="relative border-b border-gray-100">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索学生"
                className="w-full py-2 pl-8 pr-2 text-sm outline-none"
              />
            </div>
            <div className="max-h-44 overflow-y-auto">
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
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function SeatSettingsModal({ open, students, settings, canUndo, onUpdate, onRandomize, onOrderByList, onUndo, onClose }: SeatSettingsModalProps) {
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [noPairA, setNoPairA] = useState("");
  const [noPairB, setNoPairB] = useState("");
  const [frontStudentId, setFrontStudentId] = useState("");
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
    if (!a || !b || a === b) return;
    onUpdate(current => {
      const key = kind === "locked" ? "lockedDeskmatePairs" : "noDeskmatePairs";
      const exists = current.constraints[key].some(pair => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a));
      if (exists) return current;
      return { ...current, constraints: { ...current.constraints, [key]: [...current.constraints[key], { a, b }] } };
    });
    if (kind === "locked") { setPairA(""); setPairB(""); } else { setNoPairA(""); setNoPairB(""); }
  }

  function removePair(kind: "locked" | "no", a: StudentId, b: StudentId) {
    onUpdate(current => {
      const key = kind === "locked" ? "lockedDeskmatePairs" : "noDeskmatePairs";
      return { ...current, constraints: { ...current.constraints, [key]: current.constraints[key].filter(pair => !(pair.a === a && pair.b === b)) } };
    });
  }

  function addFrontStudent() {
    if (!frontStudentId) return;
    onUpdate(current => {
      if (current.constraints.frontRowStudentIds.includes(frontStudentId)) return current;
      return { ...current, constraints: { ...current.constraints, frontRowStudentIds: [...current.constraints.frontRowStudentIds, frontStudentId] } };
    });
    setFrontStudentId("");
  }

  function removeFrontStudent(id: StudentId) {
    updateConstraints({ frontRowStudentIds: constraints.frontRowStudentIds.filter(item => item !== id) });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">排座</h2>
            <p className="mt-0.5 text-xs text-gray-400">先设置限制条件，再在下方排座。</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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
              <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
                <span>前排排数（用于"必须前排"）</span>
                <input type="number" min={0} max={20} value={constraints.frontRows} onChange={e => updateConstraints({ frontRows: Math.max(0, Number(e.target.value) || 0) })} className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-blue-300" />
              </label>
            </div>
          </Section>

          <Section title="互补搭配" hint="按标签让强弱/性格互补的同学尽量同桌。">
            <div className="grid grid-cols-2 gap-2">
              {COMPLEMENT_RULES.map(rule => {
                const active = settings.complementRuleIds.includes(rule.id);
                return (
                  <button key={rule.id} onClick={() => toggleComplement(rule.id)} className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {rule.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="必须坐前排" hint={`安排在前 ${constraints.frontRows} 排。`}>
            <div className="flex gap-2">
              <StudentPicker students={students} value={frontStudentId} onChange={setFrontStudentId} placeholder="搜索并选择学生" excludeIds={constraints.frontRowStudentIds} />
              <button onClick={addFrontStudent} disabled={!frontStudentId} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" /></button>
            </div>
            {constraints.frontRowStudentIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {constraints.frontRowStudentIds.map(id => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 py-1 pl-3 pr-1.5 text-sm font-semibold text-blue-700">
                    {nameById.get(id) || "未知"}
                    <button onClick={() => removeFrontStudent(id)} className="grid h-4 w-4 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title="固定同桌" hint="这两位尽量安排在一起。">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <StudentPicker students={students} value={pairA} onChange={setPairA} placeholder="学生 A" excludeIds={pairB ? [pairB] : []} />
              <StudentPicker students={students} value={pairB} onChange={setPairB} placeholder="学生 B" excludeIds={pairA ? [pairA] : []} />
              <button onClick={() => addPair("locked")} disabled={!pairA || !pairB || pairA === pairB} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 space-y-1.5">
              {constraints.lockedDeskmatePairs.map(pair => (
                <div key={`${pair.a}-${pair.b}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-sm">
                  <span className="text-gray-700">{nameById.get(pair.a) || "未知"} <span className="text-emerald-500">＋</span> {nameById.get(pair.b) || "未知"}</span>
                  <button onClick={() => removePair("locked", pair.a, pair.b)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="不能同桌" hint="这两位尽量分开。">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <StudentPicker students={students} value={noPairA} onChange={setNoPairA} placeholder="学生 A" excludeIds={noPairB ? [noPairB] : []} />
              <StudentPicker students={students} value={noPairB} onChange={setNoPairB} placeholder="学生 B" excludeIds={noPairA ? [noPairA] : []} />
              <button onClick={() => addPair("no")} disabled={!noPairA || !noPairB || noPairA === noPairB} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 space-y-1.5">
              {constraints.noDeskmatePairs.map(pair => (
                <div key={`${pair.a}-${pair.b}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-sm">
                  <span className="text-gray-700">{nameById.get(pair.a) || "未知"} <span className="text-red-400">✕</span> {nameById.get(pair.b) || "未知"}</span>
                  <button onClick={() => removePair("no", pair.a, pair.b)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={() => { onClose(); onRandomize(); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Shuffle className="h-4 w-4" />随机排座
          </button>
          <button onClick={() => { onClose(); onOrderByList(); }} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <RotateCcw className="h-4 w-4" />名单顺序
          </button>
          <button onClick={onUndo} disabled={!canUndo} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-300">
            <Undo2 className="h-4 w-4" />撤销
          </button>
        </div>
      </div>
    </div>
  );
}
