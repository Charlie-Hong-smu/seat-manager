import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { Plus, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AppStudent, QuickRecordPreset, RecordType, StudentId } from "../state/types";
import { StudentMultiPicker } from "./StudentPicker";
import { ActionToast, Button, MotionCollapse, SegmentedControl, ToolDrawer, Input, Textarea } from "./ui";

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
  const [studentIds, setStudentIds] = useWorkspaceDraftState<StudentId[]>("quick-record:new:studentIds", initialStudentIds);
  const [type, setType] = useWorkspaceDraftState<RecordType>("quick-record:new:type", "note");
  const [note, setNote] = useWorkspaceDraftState("quick-record:new:note", "");
  const [score, setScore] = useWorkspaceDraftState("quick-record:new:score", "");
  const [presetId, setPresetId] = useWorkspaceDraftState("quick-record:new:presetId", "");
  const [newPresetLabel, setNewPresetLabel] = useWorkspaceDraftState("quick-record:new:newPresetLabel", "");
  const [managing, setManaging] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [undo, setUndo] = useState<null | (() => void)>(null);
  useEffect(() => { if (open && initialStudentIds.length) setStudentIds(initialStudentIds); }, [initialStudentIds, open, setStudentIds]);
  const activePresets = useMemo(() => presets.filter(item => item.enabled).sort((a, b) => a.order - b.order), [presets]);

  function choosePreset(preset: QuickRecordPreset) {
    if (presetId === preset.id) { setPresetId(""); return; }
    setPresetId(preset.id); setType(preset.type); setNote(preset.note); setScore(preset.score === undefined ? "" : String(preset.score));
  }

  function apply() {
    if (!studentIds.length || (!note.trim() && type === "note")) return;
    const value = Number(score);
    const rollback = onApply({ studentIds, type, note: note.trim(), score: type !== "note" && score.trim() && Number.isFinite(value) ? value : undefined, presetId: presetId || undefined });
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
        <div className="flex flex-wrap gap-2">{activePresets.map(preset => <button key={preset.id} type="button" onClick={() => choosePreset(preset)} className={`rounded-full border px-3 py-1.5 text-caption-1-semibold transition-colors ${presetId === preset.id ? "border-accent-200 bg-accent-50 text-accent-700" : "border-border-button-default bg-background-primary-default text-text-secondary hover:bg-background-secondary-default"}`}>{preset.label}{preset.score !== undefined ? ` ${preset.score > 0 ? "+" : ""}${preset.score}` : ""}</button>)}</div>
        <SegmentedControl value={type} ariaLabel="记录类型" onChange={value => setType(value as RecordType)} options={[{ value: "reward", label: "表扬" }, { value: "punish", label: "提醒" }, { value: "note", label: "备注" }]} />
        <Textarea rows={4} value={note} onChange={setNote} placeholder="记录客观事实"  resize="none" />
        <MotionCollapse open={type !== "note"}>
          {type !== "note" && <Input label="分值（可选）" type="number" value={score} onChange={setScore} placeholder="不填则只记录" />}
        </MotionCollapse>
        <Button className="w-full" disabled={!studentIds.length || (!note.trim() && type === "note")} onClick={apply}><Save className="h-4 w-4" />{studentIds.length ? `保存到 ${studentIds.length} 名学生` : "保存记录"}</Button>
        <button type="button" aria-expanded={managing} onClick={() => setManaging(value => !value)} className="text-caption-1-semibold text-accent-600">{managing ? "收起预设管理" : "管理快捷预设"}</button>
        <MotionCollapse open={managing}>
          {managing && <div className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-secondary-default p-3">
            <div className="flex gap-2"><Input value={newPresetLabel} onChange={setNewPresetLabel} placeholder="预设名称" className="min-w-0 flex-1" /><Button size="sm" disabled={!newPresetLabel.trim()} onClick={addPreset}><Plus className="h-4 w-4"/>存为预设</Button></div>
            <p className="text-caption-1-regular text-text-tertiary">「存为预设」会把上面的类型、内容和分值存成一键填充的快捷项。</p>
            {presets.map(item => {
              const typeLabel = item.type === "reward" ? "表扬" : item.type === "punish" ? "提醒" : "备注";
              const meta = `${typeLabel}${item.score !== undefined ? ` · ${item.score > 0 ? "+" : ""}${item.score}` : ""}`;
              const deleting = pendingDeleteId === item.id;
              return <div key={item.id} className="flex items-center justify-between gap-2 text-body-regular">
                <span className={`min-w-0 ${item.enabled ? "text-text-primary" : "text-text-tertiary line-through"}`}>
                  <span className="truncate">{item.label}</span>
                  <span className="ml-1.5 text-caption-1-regular text-text-tertiary">{meta}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => onPresetsChange(presets.map(preset => preset.id === item.id ? { ...preset, enabled: !preset.enabled } : preset))} className="text-caption-1-semibold text-text-secondary">{item.enabled ? "停用" : "启用"}</button>
                  <button type="button" aria-label={deleting ? `确认删除预设 ${item.label}` : `删除预设 ${item.label}`} onClick={() => { if (deleting) { onPresetsChange(presets.filter(preset => preset.id !== item.id)); setPendingDeleteId(""); } else setPendingDeleteId(item.id); }} className={`text-caption-1-semibold ${deleting ? "text-status-danger-500" : "text-text-tertiary hover:text-status-danger-500"}`}>{deleting ? "确认删除" : "删除"}</button>
                </span>
              </div>;
            })}
          </div>}
        </MotionCollapse>
      </div>
    </ToolDrawer>
    {undo && <ActionToast message="快捷记录已保存" actionLabel="撤销" actionIcon={<RotateCcw className="h-3.5 w-3.5"/>} onAction={() => { undo(); setUndo(null); }} onClose={() => setUndo(null)} duration={6000}/>}
  </>;
}
