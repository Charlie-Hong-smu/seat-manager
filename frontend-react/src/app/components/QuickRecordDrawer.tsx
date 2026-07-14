import { Plus, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AppStudent, QuickRecordPreset, RecordType, StudentId } from "../state/types";
import { StudentMultiPicker } from "./StudentPicker";
import { ActionToast, Button, SegmentedControl, ToolDrawer } from "./ui";

export type QuickRecordInput = { studentIds: StudentId[]; type: RecordType; note: string; score?: number; presetId?: string };
const EMPTY_STUDENT_IDS: StudentId[] = [];

export function QuickRecordDrawer({ open, students, presets, initialStudentIds = EMPTY_STUDENT_IDS, onClose, onApply, onPresetsChange }: {
  open: boolean;
  students: AppStudent[];
  presets: QuickRecordPreset[];
  initialStudentIds?: StudentId[];
  onClose: () => void;
  onApply: (input: QuickRecordInput) => (() => void) | void;
  onPresetsChange: (presets: QuickRecordPreset[]) => void;
}) {
  const [studentIds, setStudentIds] = useState<StudentId[]>(initialStudentIds);
  const [type, setType] = useState<RecordType>("note");
  const [note, setNote] = useState("");
  const [score, setScore] = useState("");
  const [presetId, setPresetId] = useState("");
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [managing, setManaging] = useState(false);
  const [undo, setUndo] = useState<null | (() => void)>(null);
  useEffect(() => { if (open) setStudentIds(initialStudentIds); }, [initialStudentIds, open]);
  const activePresets = useMemo(() => presets.filter(item => item.enabled).sort((a, b) => a.order - b.order), [presets]);

  function choosePreset(preset: QuickRecordPreset) {
    setPresetId(preset.id); setType(preset.type); setNote(preset.note); setScore(preset.score === undefined ? "" : String(preset.score));
  }

  function apply() {
    if (!studentIds.length || (!note.trim() && type === "note")) return;
    const value = Number(score);
    const rollback = onApply({ studentIds, type, note: note.trim(), score: score.trim() && Number.isFinite(value) ? value : undefined, presetId: presetId || undefined });
    setUndo(() => rollback || null);
    setNote(""); setScore(""); setPresetId("");
  }

  function addPreset() {
    if (!newPresetLabel.trim()) return;
    const value = Number(score);
    onPresetsChange([...presets, { id: `preset-${Date.now()}`, label: newPresetLabel.trim(), type, note: note.trim(), score: score.trim() && Number.isFinite(value) ? value : undefined, enabled: true, order: presets.length }]);
    setNewPresetLabel("");
  }

  return <>
    <ToolDrawer open={open} title="快捷记录" onClose={onClose}>
      <div className="space-y-4">
        <StudentMultiPicker students={students} values={studentIds} onChange={setStudentIds} label="记录学生" emptyLabel="请选择学生" />
        <div className="flex flex-wrap gap-2">{activePresets.map(preset => <button key={preset.id} type="button" onClick={() => choosePreset(preset)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${presetId === preset.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{preset.label}{preset.score !== undefined ? ` ${preset.score > 0 ? "+" : ""}${preset.score}` : ""}</button>)}</div>
        <SegmentedControl value={type} ariaLabel="记录类型" onChange={value => setType(value as RecordType)} options={[{ value: "reward", label: "表扬" }, { value: "punish", label: "提醒" }, { value: "note", label: "备注" }]} />
        <textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="记录客观事实" className="w-full resize-none rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:border-blue-300" />
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-400">可选分值</span><input type="number" value={score} onChange={event => setScore(event.target.value)} placeholder="不填则只记录" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 text-sm outline-none focus:border-blue-300" /></label>
        <Button className="w-full" disabled={!studentIds.length || (!note.trim() && type === "note")} onClick={apply}><Save className="h-4 w-4" />保存到 {studentIds.length || 0} 名学生</Button>
        <button type="button" onClick={() => setManaging(value => !value)} className="text-xs font-bold text-blue-600">{managing ? "收起预设管理" : "管理快捷预设"}</button>
        {managing && <div className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-gray-50 p-3">
          <div className="flex gap-2"><input value={newPresetLabel} onChange={event => setNewPresetLabel(event.target.value)} placeholder="新预设名称" className="h-9 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm"/><Button size="sm" disabled={!newPresetLabel.trim()} onClick={addPreset}><Plus className="h-4 w-4"/>保存当前内容</Button></div>
          {presets.map(item => <div key={item.id} className="flex items-center justify-between gap-2 text-sm"><span className={item.enabled ? "text-gray-700" : "text-gray-400 line-through"}>{item.label}</span><button type="button" onClick={() => onPresetsChange(presets.map(preset => preset.id === item.id ? { ...preset, enabled: !preset.enabled } : preset))} className="text-xs font-bold text-gray-500">{item.enabled ? "停用" : "启用"}</button></div>)}
        </div>}
        <Button variant="ghost" className="w-full" onClick={onClose}><X className="h-4 w-4"/>关闭</Button>
      </div>
    </ToolDrawer>
    {undo && <ActionToast message="快捷记录已保存" actionLabel="撤销" actionIcon={<RotateCcw className="h-3.5 w-3.5"/>} onAction={() => { undo(); setUndo(null); }} onClose={() => setUndo(null)} duration={6000}/>}
  </>;
}
