import { useRef, useState } from "react";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { setStudentClassDuties, studentDutyLabels, type ClassDutiesBinding } from "../state/classDuties";
import { Button, Checkbox, MotionCollapse } from "./ui";

export function StudentDutiesSection({ binding, studentId }: { binding: ClassDutiesBinding; studentId: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected, clear] = useWorkspaceDraftState<string[]>(`class-duties:student:${studentId}`, () => binding.value.roles.filter(role => binding.value.assignments[role.id]?.includes(studentId)).map(role => role.id));
  const labels = studentDutyLabels(binding, studentId);
  function finishEditing() {
    clear();
    setEditing(false);
    // Keep focus and the saved summary visible when the long checklist collapses.
    sectionRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }
  return <section ref={sectionRef} className="student-profile-duties" aria-label="学生职务">
    <div className="flex items-center justify-between gap-3"><h3 className="text-body-semibold text-text-primary">班级职务</h3><Button size="sm" variant="ghost" onClick={() => setEditing(value => !value)} aria-expanded={editing}>{editing ? "收起" : "调整职务"}</Button></div>
    <div className="mt-2 flex flex-wrap gap-2">{labels.length ? labels.map(label => <span key={label} className="rounded-md bg-background-secondary-default px-2 py-1 text-caption-1-medium text-text-secondary">{label}</span>) : <span className="text-caption-1-regular text-text-tertiary">暂未任职</span>}</div>
    <MotionCollapse open={editing} contentClassName="space-y-3 pt-3">
      {(["class", "subject"] as const).map(category => <fieldset key={category}><legend className="mb-2 text-caption-1-semibold text-text-secondary">{category === "class" ? "班委与其他职务" : "课代表"}</legend><div className="grid grid-cols-2 gap-3">{binding.value.roles.filter(role => role.category === category).map(role => <Checkbox key={role.id} isSelected={selected.includes(role.id)} onChange={checked => setSelected(current => checked ? [...current, role.id] : current.filter(id => id !== role.id))}>{role.name}</Checkbox>)}</div></fieldset>)}
      {!binding.value.roles.length && <p className="text-body-regular text-text-tertiary">暂无职务，可在座位页面的“班级职务”中添加。</p>}
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { finishEditing(); }}>放弃修改</Button><Button size="sm" onClick={() => { binding.onChange(current => setStudentClassDuties(current, studentId, selected)); finishEditing(); binding.notify("学生职务已保存"); }}>保存职务</Button></div>
    </MotionCollapse>
  </section>;
}
