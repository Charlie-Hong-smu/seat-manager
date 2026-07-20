import { ArrowRight, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { BusinessEntityPreviewModel } from "../state/types";
import { Button, IconButton } from "./ui";

const STATUS_TONE = {
  default: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  muted: "bg-gray-100 text-gray-500",
};

export function ContextEntityPreview({ id, open, model, leavesWorkbench = false, onClose, onNavigate }: {
  id: string;
  open: boolean;
  model: BusinessEntityPreviewModel | null;
  leavesWorkbench?: boolean;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const [renderedModel, setRenderedModel] = useState<BusinessEntityPreviewModel | null>(model);
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(open && model ? "open" : "closed");

  useEffect(() => {
    if (open && model) {
      setRenderedModel(model);
      setPhase(current => current === "closed" ? "opening" : "open");
      return;
    }
    setPhase(current => current === "closed" ? "closed" : "closing");
  }, [model, open]);

  useEffect(() => {
    if (phase !== "opening") return;
    const frame = window.requestAnimationFrame(() => setPhase("open"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  if (!renderedModel || phase === "closed") return null;
  const canNavigate = renderedModel.availability === "available" && Boolean(renderedModel.navigationLabel && onNavigate);
  return (
    <section
      id={id}
      aria-label={`${renderedModel.title}事项速览`}
      data-phase={phase}
      onTransitionEnd={event => {
        if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows" || phase !== "closing") return;
        setPhase("closed");
        setRenderedModel(null);
      }}
      className="student-context-preview-motion grid overflow-hidden rounded-[var(--app-radius-sm)] border border-blue-100 bg-blue-50/35"
    >
      <div className="min-h-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-blue-100/80 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-blue-600">{renderedModel.domainLabel}</span>
            {renderedModel.status && <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[renderedModel.statusTone || "default"]}`}>{renderedModel.status}</span>}
          </div>
          <h4 className="mt-1 text-sm font-bold text-gray-800">{renderedModel.title}</h4>
          {renderedModel.subtitle && <p className="mt-0.5 text-xs text-gray-500">{renderedModel.subtitle}</p>}
        </div>
        <IconButton size="sm" label="收起事项速览" onClick={onClose}><X className="h-3.5 w-3.5" /></IconButton>
      </div>
      <div className="space-y-3 px-4 py-3">
        {renderedModel.facts.length > 0 && <dl className="grid gap-2 sm:grid-cols-2">{renderedModel.facts.map(fact => <div key={`${fact.label}-${fact.value}`} className="rounded-lg bg-white/80 px-3 py-2"><dt className="text-[10px] font-bold text-gray-400">{fact.label}</dt><dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-gray-700">{fact.value}</dd></div>)}</dl>}
        {renderedModel.description && <p className="whitespace-pre-line text-xs leading-5 text-gray-600">{renderedModel.description}</p>}
        {renderedModel.availability !== "available" && <div className="flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{renderedModel.availability === "missing" ? "原始业务内容已不存在，当前仅展示保留下来的历史信息。" : "当前来源没有独立工作区，可在这里查看已有摘要。"}</span></div>}
        {canNavigate && <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onNavigate}>{renderedModel.navigationLabel}{leavesWorkbench ? "（离开评语工作台）" : ""}<ArrowRight className="h-3.5 w-3.5" /></Button></div>}
      </div>
      </div>
    </section>
  );
}
