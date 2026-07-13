import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";

import type { DormitoryPeriodMode, DormitoryPeriodSettings } from "../state/types";
import type { DormitoryPeriodRange } from "../state/dormitoryPeriods";
import { Button, Card, DatePicker, IconButton, SegmentedControl } from "./ui";

export function DormitoryPeriodToolbar({
  mode,
  onModeChange,
  anchor,
  onAnchorChange,
  range,
  settings,
  onSettingsChange,
}: {
  mode: DormitoryPeriodMode;
  onModeChange: (mode: DormitoryPeriodMode) => void;
  anchor: string;
  onAnchorChange: (anchor: string) => void;
  range: DormitoryPeriodRange;
  settings: DormitoryPeriodSettings;
  onSettingsChange: (settings: DormitoryPeriodSettings) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  function selectMode(nextMode: DormitoryPeriodMode) {
    onModeChange(nextMode);
  }

  return (
    <div className="shrink-0 px-4 pt-4">
      <Card bodyClassName="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={mode}
            onChange={selectMode}
            ariaLabel="宿舍统计周期"
            className="w-[17rem] shrink-0"
            options={[{ value: "week", label: "本周" }, { value: "month", label: "本月" }, { value: "custom", label: "自定义周期" }]}
          />
          <IconButton size="sm" label="上一个周期" onClick={() => onAnchorChange("previous")}><ChevronLeft className="h-4 w-4" /></IconButton>
          <DatePicker value={anchor} onChange={onAnchorChange} ariaLabel="宿舍统计日期" className="h-9 w-44 bg-[var(--app-surface-muted)]" />
          <IconButton size="sm" label="下一个周期" onClick={() => onAnchorChange("next")}><ChevronRight className="h-4 w-4" /></IconButton>
          <span className="min-w-0 flex-1 text-xs font-bold text-[var(--app-text-muted)]">{range.label}</span>
          <IconButton size="sm" label="设置自定义周期" active={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><Settings2 className="h-4 w-4" /></IconButton>
        </div>
        <div
          aria-hidden={!settingsOpen}
          inert={!settingsOpen}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${settingsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className={`mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--app-border)] pt-3 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${settingsOpen ? "translate-y-0" : "-translate-y-2"}`}>
              <label className="min-w-44">
                <span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">周期起始日</span>
                <DatePicker value={draft.anchorDate} onChange={anchorDate => setDraft(current => ({ ...current, anchorDate }))} ariaLabel="自定义周期起始日" className="w-full" />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">重复单位</span>
                <SegmentedControl value={draft.unit} onChange={unit => setDraft(current => ({ ...current, unit }))} ariaLabel="自定义周期单位" options={[{ value: "week", label: "周" }, { value: "month", label: "月" }]} />
              </div>
              <label className="w-28">
                <span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">每 N 个单位</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.intervalCount}
                  onChange={event => setDraft(current => ({ ...current, intervalCount: Math.min(12, Math.max(1, Number(event.target.value) || 1)) }))}
                  className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-sm outline-none focus:border-blue-300"
                />
              </label>
              <div className="pb-0.5 text-xs text-[var(--app-text-muted)]">当前规则：每 {draft.intervalCount} {draft.unit === "week" ? "周" : "个月"}一个周期</div>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setDraft(settings); setSettingsOpen(false); }}>取消</Button>
                <Button size="sm" onClick={() => { onSettingsChange(draft); onModeChange("custom"); onAnchorChange(draft.anchorDate); setSettingsOpen(false); }}>保存周期</Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
