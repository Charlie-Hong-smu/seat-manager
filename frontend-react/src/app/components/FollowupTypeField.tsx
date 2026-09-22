import { useState } from "react";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { validateFollowupTypes } from "../state/followupTypes";
import { Button, MotionCollapse, SelectMenu, Textarea } from "./ui";

export interface FollowupTypeCatalogProps { taskTypes: string[]; onTaskTypesChange: (values: string[]) => void }

export function FollowupTypeField({ value, onChange, taskTypes, onTaskTypesChange }: FollowupTypeCatalogProps & { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const initialDraft = { base: JSON.stringify(taskTypes), text: taskTypes.join("\n") };
  const [cachedDraft, setDraft, clearDraft] = useWorkspaceDraftState("followup:type-catalog", initialDraft);
  const draft = typeof cachedDraft.base !== "string" || typeof cachedDraft.text !== "string" || cachedDraft.base === JSON.stringify(cachedDraft.text.split("\n")) ? initialDraft : cachedDraft;
  const [message, setMessage] = useState("");
  const options = taskTypes.map(type => ({ value: type, label: type }));
  if (value && !taskTypes.includes(value)) options.unshift({ value, label: `${value}（原类型）` });
  function save() {
    const result = validateFollowupTypes(draft.text);
    if (result.error) { setMessage(result.error); return; }
    if (draft.base !== JSON.stringify(taskTypes)) { setMessage("类型已在其他入口修改，请重新载入后编辑。"); return; }
    onTaskTypesChange(result.values);
    clearDraft();
    setOpen(false);
    setMessage("任务类型已保存");
  }
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2"><span className="text-caption-1-semibold text-[var(--app-text-muted)]">任务类型</span><Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(current => !current)}>{open ? "收起类型编辑" : "编辑类型"}</Button></div>
    <SelectMenu value={value} onChange={onChange} ariaLabel="跟进类型" className="w-full" options={options}/>
    <MotionCollapse open={open}><div className="space-y-2 rounded-[var(--app-radius-sm)] border border-separator-border bg-background-secondary-default p-3">
      <Textarea label="可选任务类型" value={draft.text} onChange={text => { setDraft({ ...draft, text }); setMessage(""); }} rows={5}/>
      <p className="text-caption-1-regular text-text-tertiary">每行一种，可新增、改名或删除。已有任务保留原类型。</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={save}>保存类型</Button><Button size="sm" variant="ghost" onClick={() => { clearDraft(); setMessage(""); setOpen(false); }}>放弃修改</Button>{draft.base !== JSON.stringify(taskTypes) && <Button size="sm" variant="ghost" onClick={() => { clearDraft(); setMessage(""); }}>重新载入类型</Button>}</div>
    </div></MotionCollapse>
    {message && <p role="status" className="text-caption-1-regular text-text-secondary">{message}</p>}
  </div>;
}
