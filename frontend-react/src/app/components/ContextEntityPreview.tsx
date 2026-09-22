import { ArrowRight, Info, X } from "lucide-react";
import { useRef } from "react";

import type { BusinessEntityPreviewModel } from "../state/types";
import { MotionCollapse, MotionSwitch, Button, IconButton } from "./ui";

const STATUS_TONE = {
  default: "bg-accent-50 text-accent-700",
  success: "bg-status-success-50 text-status-success-700",
  warning: "bg-status-warning-50 text-status-warning-700",
  danger: "bg-status-danger-50 text-status-danger-600",
  muted: "bg-background-tertiary-default text-text-secondary",
};

export function ContextEntityPreview({ id, open, model, leavesWorkbench = false, onClose, onNavigate }: {
  id: string;
  open: boolean;
  model: BusinessEntityPreviewModel | null;
  leavesWorkbench?: boolean;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const lastModel = useRef(model);
  if (model) lastModel.current = model;
  const renderedModel = model || lastModel.current;
  if (!renderedModel) return null;
  const canNavigate = renderedModel.availability === "available" && Boolean(renderedModel.navigationLabel && onNavigate);
  return (
    <MotionCollapse open={open && Boolean(model)} animateOnMount>
    <MotionSwitch transitionKey={renderedModel.title}>
    <section id={id} aria-label={`${renderedModel.title}事项速览`} className="overflow-hidden rounded-[var(--app-radius-sm)] border border-accent-100 bg-accent-50/35">
      <div className="min-h-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-accent-100/80 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-accent-600">{renderedModel.domainLabel}</span>
            {renderedModel.status && <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[renderedModel.statusTone || "default"]}`}>{renderedModel.status}</span>}
          </div>
          <h4 className="mt-1 text-body-semibold text-text-primary">{renderedModel.title}</h4>
          {renderedModel.subtitle && <p className="mt-0.5 text-caption-1-regular text-text-secondary">{renderedModel.subtitle}</p>}
        </div>
        <IconButton size="sm" label="收起事项速览" onClick={onClose}><X className="h-3.5 w-3.5" /></IconButton>
      </div>
      <div className="space-y-3 px-4 py-3">
        {renderedModel.facts.length > 0 && <dl className="grid gap-2 sm:grid-cols-2">{renderedModel.facts.map(fact => <div key={`${fact.label}-${fact.value}`} className="rounded-lg bg-background-primary-default/80 px-3 py-2"><dt className="text-[10px] font-bold text-text-tertiary">{fact.label}</dt><dd className="mt-0.5 break-words text-caption-1-semibold leading-5 text-text-primary">{fact.value}</dd></div>)}</dl>}
        {renderedModel.description && <p className="whitespace-pre-line text-caption-1-regular leading-5 text-text-secondary">{renderedModel.description}</p>}
        {renderedModel.availability !== "available" && <div className="flex items-start gap-2 rounded-lg bg-background-primary-default/80 px-3 py-2 text-caption-1-regular leading-5 text-text-secondary"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{renderedModel.availability === "missing" ? "原始业务内容已不存在，当前仅展示保留下来的历史信息。" : "当前来源没有独立工作区，可在这里查看已有摘要。"}</span></div>}
        {canNavigate && <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onNavigate}>{renderedModel.navigationLabel}{leavesWorkbench ? "（离开评语工作台）" : ""}<ArrowRight className="h-3.5 w-3.5" /></Button></div>}
      </div>
      </div>
    </section>
    </MotionSwitch>
    </MotionCollapse>
  );
}
