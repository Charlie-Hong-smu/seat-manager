import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { classDutyNameError, defaultClassDutyRoles, type ClassDuty, type ClassDutiesBinding, type ClassDutyCategory } from "../state/classDuties";
import { StudentPicker } from "./StudentPicker";
import { Button, IconButton, Input, MotionCollapse, MotionList, MotionSwitch, UnderlineTabs, useAppDialog } from "./ui";

function DutyEditor({ role, binding, onDone }: { role: ClassDuty; binding: ClassDutiesBinding; onDone: () => void }) {
  const [name, setName, clearName] = useWorkspaceDraftState(`class-duties:role:${role.id}:name`, role.name);
  const [ids, setIds, clearIds] = useWorkspaceDraftState<string[]>(`class-duties:role:${role.id}:members`, binding.value.assignments[role.id] || []);
  const [error, setError] = useState("");
  const dialog = useAppDialog();
  function discard() { clearName(); clearIds(); onDone(); }
  return <div className="space-y-3 pt-3">
    <Input label="职务名称" value={name} onChange={value => { setName(value); setError(""); }} maxLength={30} />
    <StudentPicker compact label={`添加${role.name}人选`} students={binding.students.filter(student => !ids.includes(student.id))} value="" onChange={id => setIds(current => [...current, id])} />
    <MotionList className="flex flex-wrap gap-2">{ids.map(id => { const student = binding.students.find(item => item.id === id); return student ? <div key={id} data-motion-key={id} className="flex items-center gap-1 rounded-md bg-background-secondary-default px-2 py-1 text-caption-1-medium text-text-secondary"><span>{student.name}</span><IconButton label={`移除${student.name}任职`} onClick={() => setIds(current => current.filter(item => item !== id))}><X className="h-3.5 w-3.5" /></IconButton></div> : null; })}</MotionList>
    {error && <p role="alert" className="text-caption-1-regular text-status-danger-500">{error}</p>}
    <div className="flex items-center gap-2"><Button size="sm" variant="danger" onClick={async () => {
      if (!await dialog.confirm({ title: `删除“${role.name}”？`, description: "这个职务和当前任职安排将一起删除，学生档案及其他职务会保留。", confirmLabel: "删除职务", variant: "danger" })) return;
      binding.onChange(current => ({ ...current, roles: current.roles.filter(item => item.id !== role.id), assignments: Object.fromEntries(Object.entries(current.assignments).filter(([id]) => id !== role.id)) }));
      discard(); binding.notify("职务已删除");
    }}><Trash2 className="h-3.5 w-3.5" />删除</Button><div className="flex-1" /><Button size="sm" variant="ghost" onClick={discard}>放弃修改</Button><Button size="sm" onClick={() => {
      const issue = classDutyNameError(name, binding.value.roles, role.id);
      if (issue) { setError(issue); return; }
      binding.onChange(current => ({ ...current, roles: current.roles.map(item => item.id === role.id ? { ...item, name: name.trim().replace(/\s+/g, " ") } : item), assignments: { ...current.assignments, [role.id]: ids } }));
      discard(); binding.notify("职务已保存");
    }}>保存</Button></div>
    {dialog.dialog}
  </div>;
}

export default function ClassDutiesPanel({ binding }: { binding: ClassDutiesBinding }) {
  const [tab, setTab] = useState<ClassDutyCategory | "groups">("class");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName, clearName] = useWorkspaceDraftState("class-duties:new-name", "");
  const [error, setError] = useState("");
  const roles = binding.value.roles.filter(role => role.category === tab);
  return <div className="space-y-4">
    <UnderlineTabs value={tab} options={[{ value: "class", label: "班委与职务" }, { value: "subject", label: "课代表" }, { value: "groups", label: "小组长" }]} ariaLabel="班级职务分类" onChange={value => { setTab(value); setEditingId(null); setError(""); }} />
    <MotionSwitch transitionKey={tab}>
      {tab === "groups" ? <div className="space-y-3"><p className="text-caption-1-regular text-text-secondary">组长从当前座位组中选择；调离本组后自动解除任职。</p>{binding.groups.length ? binding.groups.map(group => <section key={group.id} className="space-y-2 rounded-xl border border-separator-border p-3"><div className="flex justify-between gap-2"><h3 className="text-body-semibold text-text-primary">{group.name}</h3><span className="text-caption-1-regular text-text-tertiary">{group.memberIds.length} 人</span></div><StudentPicker compact allowClear label={`${group.name}组长`} students={binding.students.filter(student => group.memberIds.includes(student.id))} value={binding.value.groupLeaders[group.id] || ""} onChange={id => { binding.onChange(current => ({ ...current, groupLeaders: { ...current.groupLeaders, [group.id]: id } })); binding.notify(id ? "组长已设置" : "已取消组长"); }} /></section>) : <p className="text-body-regular text-text-tertiary">当前布局没有分组，请先在“编辑布局”中创建小组。</p>}</div> : <div className="space-y-4">
        <div className="flex items-start gap-2"><Input aria-label="新增职务名称" placeholder={tab === "subject" ? "如：日语课代表" : "如：图书管理员"} value={name} maxLength={30} onChange={value => { setName(value); setError(""); }} className="min-w-0 flex-1" /><Button variant="secondary" onClick={() => {
          const issue = classDutyNameError(name, binding.value.roles);
          if (issue) { setError(issue); return; }
          const role = { id: `duty-${crypto.randomUUID()}`, name: name.trim().replace(/\s+/g, " "), category: tab };
          binding.onChange(current => ({ ...current, roles: [...current.roles, role] })); clearName(); setEditingId(role.id); binding.notify("职务已添加");
        }}><Plus className="h-4 w-4" />添加</Button></div>
        {error && <p role="alert" className="text-caption-1-regular text-status-danger-500">{error}</p>}
        <MotionList className="space-y-2">{roles.map(role => <section key={role.id} data-motion-key={role.id} className="rounded-xl border border-separator-border p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h3 className="text-body-semibold text-text-primary">{role.name}</h3><p className="mt-1 text-caption-1-regular text-text-secondary">{binding.students.filter(student => binding.value.assignments[role.id]?.includes(student.id)).map(student => student.name).join("、") || "待安排"}</p></div><IconButton label={`编辑${role.name}`} onClick={() => setEditingId(current => current === role.id ? null : role.id)}><Pencil className="h-4 w-4" /></IconButton></div><MotionCollapse open={editingId === role.id}>{editingId === role.id && <DutyEditor role={role} binding={binding} onDone={() => setEditingId(null)} />}</MotionCollapse></section>)}</MotionList>
        {!roles.length && <p className="text-body-regular text-text-tertiary">暂无职务，可在上方添加。</p>}
        <Button size="sm" variant="ghost" onClick={() => { binding.onChange(current => ({ ...current, roles: [...current.roles, ...defaultClassDutyRoles().filter(role => role.category === tab && !current.roles.some(item => item.name === role.name || item.id === role.id))] })); binding.notify("已补充缺少的常用职务"); }}>补充常用{tab === "subject" ? "课代表" : "职务"}</Button>
      </div>}
    </MotionSwitch>
  </div>;
}
