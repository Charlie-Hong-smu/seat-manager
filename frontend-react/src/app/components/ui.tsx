import { DIALOG_EXIT_DURATION, MotionSwitch, PresenceMotion } from "./motion";
export { MotionSwitch, MotionCollapse, MotionList } from "./motion";
export { ChartViewport } from "./ChartViewport";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { Input } from "@/components/base/input/input";
export { Input };
export { Checkbox } from "@/components/base/checkbox/checkbox";
import { Select as BoardSelect, SelectItem } from "@/components/base/select/select";
import { MENU_ITEM, MENU_ITEM_ACTIVE, MENU_POPOVER_SURFACE } from "@/components/base/dropdown/menu-styles";
export { Textarea } from "@/components/base/textarea/textarea";
export { Chip } from "@/components/base/badges/chip";
export { StatCards as DashboardStats } from "@/components/application/dashboard/stat-cards";
import { Button as BoardButton } from "@/components/base/buttons/button";
import { SegmentedControl as BoardSegments, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Search, TriangleAlert, X } from "lucide-react";
import { createPortal, flushSync } from "react-dom";

let activeViewTransition: ViewTransition | null = null;

/**
 * 同构详情区切换（宿舍间切换、评语工作台切换学生等）走 View Transition：
 * 浏览器捕获旧帧与新帧做交叉淡化——旧内容不先消失、新内容不带位移，
 * 读起来是内容原地"溶"成新内容。不支持或减弱动效时直接瞬时提交。
 */
// eslint-disable-next-line react-refresh/only-export-components
export function runViewTransition(commit: () => void) {
  if (typeof document === "undefined"
    || typeof document.startViewTransition !== "function"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  activeViewTransition?.skipTransition();
  const transition = document.startViewTransition(() => { flushSync(commit); });
  activeViewTransition = transition;
  void transition.finished.catch(() => undefined).finally(() => { if (activeViewTransition === transition) activeViewTransition = null; });
}

/**
 * 统一按钮组件
 * variant:
 *  - primary: 蓝色主按钮（常用操作）
 *  - ai: 石墨灰 AI 主按钮（显式智能操作）
 *  - secondary: 灰色次要按钮（取消/返回）
 *  - danger: 红色危险按钮（删除）
 *  - ghost: 浅蓝色调按钮（弹窗与面板内的轻操作）
 *  - quiet: 无底色按钮（工具栏中与唯一主操作并列的次级入口）
 */
export function Button({
  variant = "primary",
  size = "md",
  disabled,
  className = "",
  children,
  ...props
}: {
  variant?: "primary" | "ai" | "secondary" | "danger" | "ghost" | "quiet";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <BoardButton {...props} disabled={disabled} variant={variant === "ai" ? "primary" : variant}
    size={size === "sm" ? "small" : "medium"}
    className={cx("app-button", size === "lg" && "h-11 px-5", variant === "ai" && "app-button-ai", className)}>
    {children}
  </BoardButton>;
}

export function IconButton({ label, size = "md", active = false, tone = "default", variant = "secondary", className = "", children, ...props }: {
  label: string;
  size?: "xs" | "sm" | "md" | "lg";
  active?: boolean;
  tone?: "default" | "success" | "danger";
  variant?: "secondary" | "ghost" | "quiet";
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <BoardButton {...props} aria-label={label} title={label} variant={variant} size={size === "xs" ? "xs" : size === "sm" ? "small" : "medium"}
    className={cx("app-icon-button shrink-0 p-0", { xs: "size-5", sm: "size-8", md: "size-9", lg: "size-11" }[size],
      active && "bg-button-ghost-background text-button-ghost-foreground",
      tone === "success" && "text-status-success-600 bg-status-success-50",
      tone === "danger" && "text-status-danger-600 bg-status-danger-50", className)}>{children}</BoardButton>;
}

/** Compact workspaces keep their business panes mounted while showing one at a time. */
export function MobilePaneTabs<T extends string>({ value, onChange, label, options }: { value: T; onChange: (value: T) => void; label: string; options: Array<{ value: T; label: string }> }) {
  return <div className="app-mobile-pane-tabs"><SegmentedControl value={value} onChange={onChange} ariaLabel={label} options={options} className="w-full" /></div>;
}

export function InlineStatus({ message, tone = "auto", className = "" }: {
  message: string;
  tone?: "auto" | "info" | "success" | "error" | "ai";
  className?: string;
}) {
  const resolvedTone = tone === "auto"
    ? /失败|错误|无法|请先|未改变|不可用/.test(message)
      ? "error"
      : /已|完成|成功|恢复/.test(message)
        ? "success"
        : "info"
    : tone;
  const toneClass = {
    info: "bg-accent-50 text-accent-700",
    success: "bg-status-success-50 text-status-success-700",
    error: "bg-status-danger-50 text-status-danger-700",
    ai: "bg-status-ai-50 text-status-ai-700",
  }[resolvedTone];
  return <p role={resolvedTone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-[var(--app-radius-sm)] px-3 py-2 text-caption-1-semibold leading-5 ${toneClass} ${className}`}>{message}</p>;
}

/**
 * 内联指标行：语义圆点 + 标签 + 数字 + 小字。
 * 用于替换装饰性统计大卡——信息相同时更轻；onOpen 时整段可点；
 * 带 selected 时可直接充当单选筛选条（替代描边药丸筛选）。
 */
export function MetricStrip({ items, size = "md", className = "" }: {
  items: Array<{
    key: string;
    label: string;
    value: string | number;
    dot?: string;
    caption?: string;
    selected?: boolean;
    onOpen?: () => void;
  }>;
  size?: "md" | "sm";
  className?: string;
}) {
  const compact = size === "sm";
  return <div className={cx("flex flex-wrap items-center gap-x-1 gap-y-1", className)}>
    {items.map(item => {
      const content = <>
        {item.dot && <span aria-hidden="true" className={cx("size-2 shrink-0 self-center rounded-full", item.dot)} />}
        <span className={cx(compact ? "text-caption-1-semibold" : "text-body-medium", item.selected ? "text-accent-700" : "text-text-secondary")}>{item.label}</span>
        <span className={cx("tabular-nums", compact ? "text-body-semibold" : "text-title-2-medium", item.selected ? "text-accent-700" : "text-text-primary")}>{item.value}</span>
        {item.caption && <span className="text-caption-1-regular text-text-secondary">{item.caption}</span>}
      </>;
      const itemClass = cx("flex items-baseline rounded-lg", compact ? "gap-1.5 px-2.5 py-1.5" : "gap-2 px-3 py-2");
      return item.onOpen
        ? <button key={item.key} type="button" onClick={item.onOpen} aria-pressed={item.selected ?? undefined}
            className={cx(itemClass, "text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring", item.selected ? "bg-accent-50" : "hover:bg-background-secondary-default")}>{content}</button>
        : <span key={item.key} className={itemClass}>{content}</span>;
    })}
  </div>;
}

const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// eslint-disable-next-line react-refresh/only-export-components
export function useModalFocus(open: boolean, onEscape: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  // Capture before descendant autoFocus runs during the DOM commit.
  if (open && !wasOpenRef.current) restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasOpenRef.current = open;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[autofocus], [data-autofocus=true]") || panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) || panel;
    // React 的 autoFocus 不会输出 autofocus 属性；保留已在弹窗内的输入焦点。
    const focusTimer = window.setTimeout(() => { if (!panel?.contains(document.activeElement)) first?.focus(); }, 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        // Only the top-most open dialog answers Escape; stacked dialogs close one layer at a time.
        const openOverlays = [...document.querySelectorAll(".app-modal-overlay")].filter(overlay => !overlay.closest(".dialog-presence[data-phase='closing']"));
        const top = openOverlays[openOverlays.length - 1];
        if (panel && top && !top.contains(panel)) return;
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(element => !element.hidden && !element.closest("[inert], [aria-hidden=true]") && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      restoreRef.current?.focus();
    };
  }, [open]);
  return panelRef;
}

// Retain the rendered content during exit, including titles cleared by callers.
export function DialogPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [present, setPresent] = useState(open);
  const lastContent = useRef(children);
  if (open) lastContent.current = children;
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPresent(false), reduced ? 0 : DIALOG_EXIT_DURATION + 20);
    return () => window.clearTimeout(timer);
  }, [open]);
  if (!open && !present) return null;
  const content = <PresenceMotion active={open} className="dialog-presence contents">{open ? children : lastContent.current}</PresenceMotion>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

/**
 * 弹窗统一头部：浅色身份区，承载可选图标、眉题、标题、说明、操作与关闭。
 * 页签等附属导航作为 children 放在同一区域底部，避免头部与页签之间再切一刀。
 */
export function ModalHeader({ title, titleId, eyebrow, description, descriptionId, icon, actions, onClose, closeLabel = "关闭", children, className = "" }: {
  title: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return <header className={cx("app-modal-header", className)}>
    <div className="flex items-start gap-3">
      {icon && <span aria-hidden className="app-modal-header__icon">{icon}</span>}
      <div className="min-w-0 flex-1 self-center">
        {eyebrow && <div className="mb-0.5 text-caption-1-medium text-text-tertiary">{eyebrow}</div>}
        <h2 id={titleId} className="truncate text-title-3-semibold text-text-primary">{title}</h2>
        {description && <p id={descriptionId} className="mt-0.5 text-caption-1-regular leading-5 text-text-secondary">{description}</p>}
      </div>
      {(actions || onClose) && <div className="flex shrink-0 items-center gap-1">{actions}{onClose && <IconButton label={closeLabel} size="sm" variant="quiet" onClick={onClose}><X className="h-4 w-4" /></IconButton>}</div>}
    </div>
    {children}
  </header>;
}

/** 弹窗与面板内的分组：单层边框、无灰色标题条，标题行可带说明与右侧操作。 */
export function PanelSection({ title, meta, action, children, className = "", bodyClassName = "" }: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return <section className={cx("panel-section", className)}>
    <div className="panel-section__head">
      <div className="min-w-0"><h3 className="text-body-semibold text-text-primary">{title}</h3>{meta && <p className="mt-0.5 text-caption-1-regular text-text-tertiary">{meta}</p>}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className={cx("panel-section__body", bodyClassName)}>{children}</div>
  </section>;
}

export function ModalShell({ open, title, description, children, footer, onClose, className = "max-w-lg" }: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useModalFocus(open, onClose);
  return createPortal(<DialogPresence open={open}><div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[90] grid place-items-center p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`modal-panel-enter app-modal-panel app-modal-shell flex max-h-[calc(100dvh-32px)] w-full flex-col overflow-hidden outline-none ${className}`}>
      <ModalHeader title={title} titleId={titleId} description={description} descriptionId={descriptionId} onClose={onClose} />
      <div className="min-h-0 max-h-[70dvh] overflow-y-auto p-5">{children}</div>
      {footer && <footer className="app-modal-footer shrink-0 flex flex-wrap justify-end gap-2 px-5 py-3.5">{footer}</footer>}
    </div>
  </div></DialogPresence>, document.body);
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  alternateLabel,
  variant = "danger",
  showCancel = true,
  error,
  onCancel,
  onConfirm,
  onAlternate,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  alternateLabel?: string;
  variant?: "primary" | "danger";
  showCancel?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onAlternate?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useModalFocus(open, onCancel);

  return createPortal(<DialogPresence open={open}><div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[90] grid place-items-center p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="modal-panel-enter app-modal-panel w-full max-w-sm overflow-hidden outline-none">
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          {variant === "danger" && <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-status-danger-50 text-status-danger-600"><TriangleAlert className="h-4 w-4" aria-hidden /></span>}
          <div className="min-w-0">
            <h2 id={titleId} className="text-title-3-semibold text-[var(--app-text)]">{title}</h2>
            <p id={descriptionId} className="mt-1.5 text-body-regular leading-6 text-[var(--app-text-muted)]">{description}</p>
          </div>
        </div>
        {error && <p role="alert" className="mt-3 rounded-[var(--app-radius-sm)] bg-status-danger-50 px-3 py-2 text-caption-1-semibold text-status-danger-600">{error}</p>}
      </div>
      <div className="app-modal-footer flex flex-wrap justify-end gap-2 px-5 py-3.5">{showCancel && <Button variant="ghost" onClick={onCancel}>取消</Button>}{alternateLabel && onAlternate && <Button variant="secondary" onClick={onAlternate}>{alternateLabel}</Button>}<Button autoFocus variant={variant} onClick={onConfirm}>{confirmLabel}</Button></div>
    </div>
  </div></DialogPresence>, document.body);
}

type AppDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
};

type AppDialogRequest = AppDialogOptions & {
  mode: "confirm" | "notice";
  resolve: (confirmed: boolean) => void;
};

type AppPromptOptions = AppDialogOptions & { defaultValue?: string; inputLabel?: string; validate?: (value: string) => string | undefined };

function PromptDialog({ open, title, description, defaultValue = "", inputLabel = "名称", confirmLabel = "保存", validate, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; defaultValue?: string; inputLabel?: string; confirmLabel?: string; validate?: AppPromptOptions["validate"];
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => { if (open) setValue(defaultValue); }, [defaultValue, open]);
  const error = validate?.(value);
  return <ModalShell open={open} title={title} description={description} onClose={onCancel} className="max-w-sm" footer={<><Button variant="ghost" onClick={onCancel}>取消</Button><Button disabled={Boolean(error)} onClick={() => onConfirm(value)}>{confirmLabel}</Button></>}>
    <Input label={inputLabel} autoFocus value={value} isInvalid={Boolean(error)} onChange={setValue} onKeyDown={event => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      // Prevent Enter from activating the trigger after focus is restored.
      event.preventDefault();
      event.stopPropagation();
      if (!error) onConfirm(value);
    }} />
    {error && <InlineStatus message={error} tone="error" className="mt-3" />}
  </ModalShell>;
}

// 与 ConfirmDialog 共置，确保所有业务确认都从唯一设计系统入口创建。
// eslint-disable-next-line react-refresh/only-export-components
export function useAppDialog() {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<(AppPromptOptions & { resolve: (value: string | null) => void }) | null>(null);
  const open = useCallback((mode: AppDialogRequest["mode"], options: AppDialogOptions) => new Promise<boolean>(resolve => setRequest({ ...options, mode, resolve })), []);
  const close = useCallback((confirmed: boolean) => {
    setRequest(current => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);
  return {
    confirm: useCallback((options: AppDialogOptions) => open("confirm", options), [open]),
    notice: useCallback((options: AppDialogOptions) => open("notice", options).then(() => undefined), [open]),
    prompt: useCallback((options: AppPromptOptions) => new Promise<string | null>(resolve => setPromptRequest({ ...options, resolve })), []),
    dialog: <><ConfirmDialog open={Boolean(request)} title={request?.title || "提示"} description={request?.description || ""} confirmLabel={request?.confirmLabel || (request?.mode === "notice" ? "知道了" : "确认")} variant={request?.variant || "primary"} showCancel={request?.mode !== "notice"} onCancel={() => close(false)} onConfirm={() => close(true)} /><PromptDialog open={Boolean(promptRequest)} title={promptRequest?.title || "请输入"} description={promptRequest?.description || ""} defaultValue={promptRequest?.defaultValue} inputLabel={promptRequest?.inputLabel} confirmLabel={promptRequest?.confirmLabel} validate={promptRequest?.validate} onCancel={() => { promptRequest?.resolve(null); setPromptRequest(null); }} onConfirm={value => { promptRequest?.resolve(value); setPromptRequest(null); }} /></>,
  };
}

type ActionToastOptions = {
  message: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
  duration?: number;
};

export function ActionToast({ message, actionLabel, actionIcon, onAction, onClose, duration = 4000 }: ActionToastOptions & { onClose: () => void }) {
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimerRef.current = window.setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const autoCloseTimer = window.setTimeout(requestClose, duration);
    return () => window.clearTimeout(autoCloseTimer);
  }, [duration, requestClose]);
  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  return <div role="status" aria-live="polite" data-phase={phase} className="action-toast fixed bottom-5 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-text-primary px-4 py-3 text-body-regular text-text-white shadow-2xl">
    <span className="min-w-0">{message}</span>
    {actionLabel && onAction && <button type="button" onClick={() => { onAction(); requestClose(); }} className="flex shrink-0 items-center gap-1 rounded-lg bg-background-primary-default/10 px-2 py-1 font-bold transition-colors hover:bg-background-primary-default/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">{actionIcon}{actionLabel}</button>}
    <button type="button" onClick={requestClose} aria-label="关闭提示" className="shrink-0 text-text-white/60 transition-colors hover:text-text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"><X className="h-4 w-4"/></button>
  </div>;
}

// 短时操作反馈的唯一入口。显式创建、保存或状态更新统一从这里触发。
// eslint-disable-next-line react-refresh/only-export-components
export function useActionToast() {
  const [request, setRequest] = useState<(ActionToastOptions & { id: number }) | null>(null);
  const show = useCallback((options: string | ActionToastOptions) => {
    const normalized = typeof options === "string" ? { message: options } : options;
    setRequest({ ...normalized, id: Date.now() });
  }, []);
  const dismiss = useCallback(() => setRequest(null), []);

  return {
    show,
    dismiss,
    toast: request ? <ActionToast key={request.id} {...request} onClose={dismiss} /> : null,
  };
}

export function AiGenerationPanel({ title, steps, compact = false }: { title: string; steps: string[]; compact?: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    setActiveStep(0);
    if (steps.length < 2) return;
    const timer = window.setInterval(() => setActiveStep(current => Math.min(current + 1, steps.length - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return <div className={`ai-generation-panel ai-followup-loading-enter relative overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default text-left ${compact ? "p-3" : "p-4"}`} role="status" aria-live="polite" aria-label={title}>
    <AgentThinking label={title} variant="wave" tone="primary" shimmer={false} showTimer={false} />
    <ol className={`mt-3 ${compact ? "space-y-1" : "space-y-1.5"}`}>
      {steps.map((step, index) => {
        const state = index < activeStep ? "done" : index === activeStep ? "active" : "pending";
        return <li key={step} className="ai-step-item flex items-center gap-2" style={{ animationDelay: `${index * 90}ms` }}>
          <span aria-hidden="true" className={`grid size-[18px] shrink-0 place-items-center rounded-full transition-colors duration-300 ${state === "done" ? "bg-status-success-500 text-text-white" : state === "active" ? "bg-status-ai-600 text-text-white" : "border border-separator-border"}`}>
            {state === "done" ? <Check className="ai-step-check size-3" /> : state === "active" ? <span className="ai-step-active-dot size-1.5 rounded-full bg-current" /> : null}
          </span>
          <span className={`min-w-0 text-caption-1-regular leading-snug ${state === "done" ? "ai-step-done-label text-text-tertiary" : state === "active" ? "text-text-primary" : "text-text-tertiary"}`}>{step}</span>
        </li>;
      })}
    </ol>
  </div>;
}

/**
 * 统一卡片/面板组件
 */
export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
  overflow = "hidden",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  overflow?: "hidden" | "visible";
}) {
  return (
    <section className={`${overflow === "visible" ? "overflow-visible" : "overflow-hidden"} rounded-3xl border border-border-button-default bg-background-primary-default ${className}`}>
      {title && (
        <div className="flex h-16 items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-headline-medium text-text-primary">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  onPress,
  className = "",
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  onPress?: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return <div role="group" aria-label={ariaLabel} className={cx("inline-flex", className)}><BoardSegments aria-label={ariaLabel} selectedKeys={[value]} isDisabled={disabled}
    onSelectionChange={keys => { if (onPress) return; const selected = Array.from(keys).find(key => String(key) !== value); if (selected !== undefined) onChange(String(selected) as T); }}
    className="app-segments w-full flex-wrap">
    {options.map(option => <SegmentedControlItem key={option.value} id={option.value} onPress={onPress ? () => onPress(option.value) : undefined} className="min-h-8 min-w-max flex-1 gap-1.5 px-2.5">
      {option.icon}{option.label}
    </SegmentedControlItem>)}
  </BoardSegments></div>;
}

export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: T;
  options: Array<{ value: T; label: string; tone?: "default" | "ai" }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });
  const activeOption = options.find(option => option.value === value);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const selectedButton = buttonRefs.current.get(value);
    if (!root || !selectedButton) return;
    const updateIndicator = () => setIndicator({ left: selectedButton.offsetLeft + 12, width: Math.max(0, selectedButton.offsetWidth - 24), ready: true });
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(root);
    buttonRefs.current.forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [options.length, value]);

  return <div ref={rootRef} role="tablist" aria-label={ariaLabel} className={`relative flex items-center gap-1 border-b border-separator-border ${className}`}>
    <span aria-hidden="true" className={`pointer-events-none absolute -bottom-px h-0.5 rounded-full transition-[left,width,background-color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${activeOption?.tone === "ai" ? "bg-status-ai-600" : "bg-accent-600"}`} style={{ left: indicator.left, width: indicator.width, opacity: indicator.ready ? 1 : 0 }} />
    {options.map(option => {
      const selected = option.value === value;
      return <button key={option.value} ref={node => { if (node) buttonRefs.current.set(option.value, node); else buttonRefs.current.delete(option.value); }} type="button" role="tab" aria-selected={selected} onClick={() => onChange(option.value)} className={`relative px-4 py-2.5 text-body-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/30 ${selected ? option.tone === "ai" ? "text-status-ai-700" : "text-accent-700" : "text-text-tertiary hover:text-text-secondary"}`}>{option.label}</button>;
    })}
  </div>;
}

/**
 * 统一下拉层动效。组件始终保留在 DOM 中，因此打开和关闭都能完整播放动画。
 * 定位、尺寸和表面样式由调用方通过 className 提供。
 */
export function AnimatedPopover({
  open,
  children,
  className = "",
  style,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [phase, setPhase] = useState<"open" | "closing" | "closed">(open ? "open" : "closed");
  const closeTimerRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (openFrameRef.current !== null) window.cancelAnimationFrame(openFrameRef.current);

    if (open) {
      openFrameRef.current = window.requestAnimationFrame(() => setPhase("open"));
    } else {
      setPhase(current => current === "closed" ? "closed" : "closing");
      closeTimerRef.current = window.setTimeout(() => setPhase("closed"), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
    }

    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (openFrameRef.current !== null) window.cancelAnimationFrame(openFrameRef.current);
    };
  }, [open]);

  return (
    <div
      data-open={open}
      data-phase={phase}
      aria-hidden={!open}
      {...(!open ? { inert: "" as unknown as boolean } : {})}
      className={`app-popover-motion ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** AnimatedPopover becomes visible one frame after `open`; focusing earlier would hit a hidden node. */
function afterPopoverVisible(callback: () => void) {
  let inner = 0;
  const outer = window.requestAnimationFrame(() => { inner = window.requestAnimationFrame(callback); });
  return () => { window.cancelAnimationFrame(outer); window.cancelAnimationFrame(inner); };
}

/** Fixed-position anchor for toolbar-attached layers; flips above when there is no room below. */
function useAnchoredLayer(open: boolean, getAnchor: () => HTMLElement | null, panelRef: React.RefObject<HTMLElement>, align: "start" | "end") {
  const [position, setPosition] = useState<{ left: number; top: number; origin: string }>({ left: 0, top: 0, origin: "top right" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = getAnchor()?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.min(Math.max(8, align === "end" ? rect.right - width : rect.left), window.innerWidth - width - 8);
      const opensUp = window.innerHeight - rect.bottom - 12 < height && rect.top > window.innerHeight - rect.bottom;
      setPosition({ left, top: opensUp ? Math.max(8, rect.top - height - 6) : rect.bottom + 6, origin: `${opensUp ? "bottom" : "top"} ${align === "end" ? "right" : "left"}` });
    };
    update();
    const observer = new ResizeObserver(update);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [align, getAnchor, open, panelRef]);
  return position;
}

// Clicks inside other floating layers (select lists, date pickers, dialogs) belong to the open tool.
const NESTED_LAYER_SELECTOR = "[role='listbox'], [role='dialog'], [role='alertdialog'], .app-popover-motion";

export type ActionMenuItem = { key: string; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; tone?: "danger" };

/**
 * 工具栏"更多操作"菜单：收纳低频入口，保持唯一主操作醒目。
 * 方向键在项目间移动，Esc / Tab / 点击外部关闭并把焦点还给触发器。
 */
export function ActionMenu({ label, icon, items, triggerId, align = "end", iconOnly = false, className = "" }: {
  label: string;
  icon?: ReactNode;
  items: ActionMenuItem[];
  triggerId?: string;
  align?: "start" | "end";
  /** Compact "⋯" style trigger; `label` becomes its accessible name. */
  iconOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const getAnchor = useCallback(() => triggerRef.current, []);
  const position = useAnchoredLayer(open, getAnchor, panelRef, align);
  const enabledItems = () => [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") || [])];

  useEffect(() => {
    if (!open) return;
    const cancelFocus = afterPopoverVisible(() => enabledItems()[0]?.focus({ preventScroll: true }));
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => { cancelFocus(); document.removeEventListener("mousedown", close); };
  }, [open]);

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }

  return <>
    <BoardButton ref={triggerRef} id={triggerId} size="small" variant="quiet" className={cx(iconOnly ? "app-icon-button size-8 p-0" : "app-button", className)} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      {iconOnly ? icon : <>{icon}{label}<ChevronDown aria-hidden className={cx("h-3.5 w-3.5 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} /></>}
    </BoardButton>
    {typeof document !== "undefined" && createPortal(<AnimatedPopover open={open} className={cx(MENU_POPOVER_SURFACE, "fixed z-[125] min-w-[12rem] p-1.5")} style={{ left: position.left, top: position.top, transformOrigin: position.origin }}>
      <div ref={panelRef} id={menuId} role="menu" aria-label={label} onKeyDown={handleMenuKeyDown} className="flex flex-col gap-0.5">
        {items.map((item, index) => <button key={item.key} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} data-menu-key={item.key}
          style={{ "--menu-item-index": index } as CSSProperties}
          onClick={() => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); item.onSelect(); }}
          className={cx(MENU_ITEM, "action-menu-item h-9 text-body-medium disabled:cursor-not-allowed disabled:opacity-40", item.tone === "danger" ? "text-status-danger-600 hover:bg-status-danger-50 focus-visible:bg-status-danger-50" : "hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background")}>
          {item.icon && <span aria-hidden className={cx("grid size-5 shrink-0 place-items-center", item.tone === "danger" ? "text-status-danger-500" : "text-text-tertiary")}>{item.icon}</span>}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </button>)}
      </div>
    </AnimatedPopover>, document.body)}
  </>;
}

/**
 * 挂在触发按钮下方的轻量工具面板：用于一两个字段即可完成的短操作（抽签、快速新增）。
 * 不加遮罩、不锁定页面，老师仍能看到操作结果落在座位图上；Esc 或点击外部关闭并还原焦点。
 * 需要多段内容或长表单时继续使用 `ToolDrawer`。
 */
export function ToolPopover({ open, title, anchorId, onClose, children, footer, widthClassName = "w-[20rem]", align = "end" }: {
  open: boolean;
  title: string;
  anchorId: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  align?: "start" | "end";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const getAnchor = useCallback(() => document.getElementById(anchorId), [anchorId]);
  const position = useAnchoredLayer(open, getAnchor, panelRef, align);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Like ToolDrawer, closed tools leave the DOM after the exit motion; callers own any draft state.
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = window.setTimeout(() => setPresent(false), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const cancelFocus = afterPopoverVisible(() => {
      if (panel?.contains(document.activeElement)) return;
      (panel?.querySelector<HTMLElement>("[data-popover-autofocus]") || panel?.querySelector<HTMLElement>("[data-tool-popover-body] :is(input, textarea, button):not(:disabled)") || panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))?.focus({ preventScroll: true });
    });
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Element;
      if (panel?.contains(target) || getAnchor()?.contains(target)) return;
      if (target.closest?.(NESTED_LAYER_SELECTOR)) return;
      onCloseRef.current();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      cancelFocus();
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) getAnchor()?.focus({ preventScroll: true });
    };
  }, [getAnchor, open]);

  return typeof document === "undefined" ? null : createPortal(<AnimatedPopover open={open} className={cx("tool-popover fixed z-[80] max-w-[calc(100vw-16px)]", widthClassName)} style={{ left: position.left, top: position.top, transformOrigin: position.origin }}>
    <div ref={panelRef} role="dialog" aria-modal="false" aria-labelledby={titleId} className="flex max-h-[min(34rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-[var(--app-radius-md)] border border-border-button-default bg-background-primary-default shadow-[var(--app-shadow-float)]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 pl-4 pr-2">
        <h2 id={titleId} className="text-body-semibold text-text-primary">{title}</h2>
        <IconButton label="关闭工具面板" size="sm" variant="quiet" onClick={onClose}><X className="h-4 w-4" /></IconButton>
      </div>
      <div data-tool-popover-body className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{(open || present) && children}</div>
      {footer && (open || present) && <div className="shrink-0 border-t border-separator-border px-4 py-3">{footer}</div>}
    </div>
  </AnimatedPopover>, document.body);
}

/** 小范围整数输入：− / + 按钮与可直接键入的数字框，失焦时收敛到合法范围。 */
export function NumberStepper({ value, onChange, min = 0, max = 99, ariaLabel, className = "" }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const commit = (raw: string) => { const parsed = Number(raw); const next = Number.isFinite(parsed) && raw.trim() ? clamp(parsed) : value; setDraft(String(next)); if (next !== value) onChange(next); };
  const stepClass = "grid h-full w-8 shrink-0 place-items-center text-text-secondary transition-colors duration-150 hover:bg-background-secondary-default hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent focus-visible:outline-none focus-visible:bg-background-secondary-default";
  return <div role="group" aria-label={ariaLabel} className={cx("number-stepper inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-border-button-default bg-background-primary-default shadow-xs focus-within:border-accent-300", className)}>
    <button type="button" aria-label={`减少${ariaLabel}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))} className={stepClass}><Minus className="h-3.5 w-3.5" /></button>
    <input aria-label={ariaLabel} inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value.replace(/[^\d]/g, ""))} onBlur={event => commit(event.target.value)}
      onKeyDown={event => {
        if (event.key === "Enter") commit(event.currentTarget.value);
        else if (event.key === "ArrowUp") { event.preventDefault(); onChange(clamp(value + 1)); }
        else if (event.key === "ArrowDown") { event.preventDefault(); onChange(clamp(value - 1)); }
      }}
      className="w-9 min-w-0 border-x border-separator-border bg-transparent text-center text-body-semibold tabular-nums text-text-primary outline-none" />
    <button type="button" aria-label={`增加${ariaLabel}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))} className={stepClass}><Plus className="h-3.5 w-3.5" /></button>
  </div>;
}

type SelectMenuProps = {
  value: string | number;
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
};

export function SelectMenu(props: SelectMenuProps) {
  const { value, options, onChange, ariaLabel, placeholder = "请选择", className = "", searchable } = props;
  if (searchable ?? options.length > 8) return <SearchableSelectMenu {...props} />;
  // Prefix keys so an intentional empty-string choice stays selectable.
  return <BoardSelect aria-label={ariaLabel} selectedKey={`value:${value}`} onSelectionChange={key => { if (key !== null) onChange(String(key).slice(6)); }} placeholder={placeholder} className={className} popoverClassName="z-[125] min-w-[var(--trigger-width)] w-auto" disabledKeys={options.filter(option => option.disabled).map(option => `value:${option.value}`)}>
    {options.map(option => <SelectItem key={`value:${option.value}`} id={`value:${option.value}`} textValue={option.label}>{option.label}</SelectItem>)}
  </BoardSelect>;
}

function SearchableSelectMenu({ value, options, onChange, ariaLabel, placeholder = "请选择", className = "" }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = options.find(option => String(option.value) === String(value));
  const showSearch = true;
  const filtered = options.filter(option => !search.trim() || option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const maxHeight = Math.max(160, Math.min(320, Math.max(roomBelow, rect.top - 12)));
      const opensUp = roomBelow < 220 && rect.top > roomBelow;
      const visibleOptionCount = filtered.length || 1;
      const searchHeight = showSearch ? 46 : 0;
      const estimatedPanelHeight = Math.min(maxHeight, 16 + searchHeight + visibleOptionCount * 40 + Math.max(0, visibleOptionCount - 1) * 4);
      const width = Math.min(rect.width, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
      const top = opensUp
        ? Math.max(8, rect.top - estimatedPanelHeight - 8)
        : Math.min(rect.bottom + 8, window.innerHeight - estimatedPanelHeight - 8);
      setPosition({ left, top, width, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [filtered.length, open, showSearch]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", close);
    // Capture phase: an open menu consumes Escape before modal-level bubble
    // listeners (registered earlier on window) can close the dialog.
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true); };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className={cx("flex min-w-0 items-center gap-1.5 rounded-2lg border border-border-button-default bg-background-primary-default px-2.5 py-2 text-left text-body-medium text-text-primary shadow-xs transition-colors hover:bg-background-primary-hover hover:border-border-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring", className)}>
      <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-[var(--app-text-muted)]"}`}>{selected?.label || placeholder}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    {createPortal(<AnimatedPopover open={open} className={cx(MENU_POPOVER_SURFACE, "fixed z-[125] p-2")} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}><div ref={panelRef}>
      {showSearch && <Input autoFocus value={search} onChange={setSearch} leadingIcon={Search} placeholder="搜索选项" className="mb-2" />}
      <div role="listbox" aria-label={ariaLabel} className="max-h-[min(16rem,var(--select-menu-max-height,16rem))] space-y-1 overflow-y-auto">{filtered.map(option => {
        const active = String(option.value) === String(value);
        return <button key={String(option.value)} type="button" role="option" aria-selected={active} disabled={option.disabled} onClick={() => { onChange(String(option.value)); setOpen(false); setSearch(""); triggerRef.current?.focus(); }} className={cx(MENU_ITEM, "flex w-full items-center text-body-medium disabled:opacity-40", active && MENU_ITEM_ACTIVE)}><span className="min-w-0 flex-1 truncate text-left">{option.label}</span>{active && <Check className="h-4 w-4 shrink-0"/>}</button>;
      })}{!filtered.length && <div className="py-6 text-center text-body-regular text-[var(--app-text-muted)]">没有匹配选项</div>}</div>
    </div></AnimatedPopover>, document.body)}
  </>;
}

function parseDateValue(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
}

function formatDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePicker({ value, onChange, ariaLabel, className = "", min, max, required = false }: { value: string; onChange: (value: string) => void; ariaLabel: string; className?: string; min?: string; max?: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => { const date = parseDateValue(value); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const selected = value ? parseDateValue(value) : null;

  useEffect(() => {
    if (!value) return;
    const date = parseDateValue(value);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [value]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = 304;
      const panelHeight = 350;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8)),
        top: window.innerHeight - rect.bottom >= panelHeight ? rect.bottom + 8 : Math.max(8, rect.top - panelHeight - 8),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", close);
    // Capture phase: an open menu consumes Escape before modal-level bubble
    // listeners (registered earlier on window) can close the dialog.
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true); };
  }, [open]);

  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - visibleMonth.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const today = formatDateValue(new Date());
  const label = selected ? `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日` : "请选择日期";

  return <>
    <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`flex h-10 min-w-0 items-center gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-background-primary-default px-3 text-left text-body-regular transition-colors hover:border-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20 ${className}`}><CalendarDays className="h-4 w-4 shrink-0 text-accent-500"/><span className="min-w-0 flex-1 truncate text-[var(--app-text)]">{label}</span><ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}/></button>
    {createPortal(<AnimatedPopover open={open} className="fixed z-[125] w-[304px] rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default p-3 shadow-[var(--app-shadow-float)]" style={position}><div ref={panelRef} role="dialog" aria-label={ariaLabel}>
      <div className="mb-3 flex items-center justify-between"><IconButton size="sm" label="上个月" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4"/></IconButton><strong className="text-body-regular text-[var(--app-text)]">{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong><IconButton size="sm" label="下个月" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4"/></IconButton></div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold text-[var(--app-text-muted)]">{"日一二三四五六".split("").map(day => <span key={day} className="py-1">{day}</span>)}</div>
      <MotionSwitch transitionKey={`${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`} contentClassName="mt-1 grid grid-cols-7 gap-0.5">{days.map(day => { const dayValue = formatDateValue(day); const active = dayValue === value; const currentMonth = day.getMonth() === visibleMonth.getMonth(); const disabled = Boolean((min && dayValue < min) || (max && dayValue > max)); return <button key={dayValue} type="button" disabled={disabled} aria-label={dayValue} aria-pressed={active} onClick={() => { onChange(dayValue); setOpen(false); triggerRef.current?.focus(); }} className={`grid h-9 place-items-center rounded-[var(--app-radius-sm)] text-caption-1-regular transition-colors disabled:opacity-25 ${active ? "bg-accent-600 font-bold text-text-white" : dayValue === today ? "bg-accent-50 font-bold text-accent-700" : currentMonth ? "text-text-primary hover:bg-background-tertiary-default" : "text-text-tertiary hover:bg-background-secondary-default"}`}>{day.getDate()}</button>; })}</MotionSwitch>
      <div className="mt-3 flex justify-between border-t border-separator-border pt-2"><Button size="sm" variant="ghost" disabled={required} onClick={() => { if (!required) onChange(""); setOpen(false); }}>清除</Button><Button size="sm" variant="secondary" disabled={Boolean((min && today < min) || (max && today > max))} onClick={() => { onChange(today); setOpen(false); }}>今天</Button></div>
    </div></AnimatedPopover>, document.body)}
  </>;
}

const DRAWER_DOCK_ID = "app-drawer-dock";
const DRAWER_DOCK_GAP = 12;
const DRAWER_DOCK_MS = 440;
let dockStack: Array<{ key: object; width: number }> = [];
const dockListeners = new Set<() => void>();
function updateDockStack(next: typeof dockStack) {
  dockStack = next;
  dockListeners.forEach(listener => listener());
}
function subscribeDock(listener: () => void) {
  dockListeners.add(listener);
  return () => { dockListeners.delete(listener); };
}

/**
 * 工作区右侧的抽屉停靠槽。打开的 `ToolDrawer` 停进这里，主界面以同一缓动让出宽度，
 * 而不是被遮罩盖住；槽位关闭时宽度与间距同时归零。
 */
export function DrawerDock() {
  const width = useSyncExternalStore(subscribeDock, () => dockStack[dockStack.length - 1]?.width ?? 0, () => 0);
  return <div id={DRAWER_DOCK_ID} className="app-drawer-dock" data-open={width > 0 ? "true" : "false"} style={{ "--dock-width": `${width}px` } as CSSProperties} />;
}

// Dock only when the drawer is opened from the workspace itself; from a modal it must stay above it.
function canDockDrawer(positionClassName: string) {
  if (typeof document === "undefined" || positionClassName !== "fixed" || window.innerWidth < 1024) return false;
  const slot = document.getElementById(DRAWER_DOCK_ID);
  return Boolean(slot && slot.getClientRects().length && !document.querySelector(".app-modal-overlay"));
}

export function ToolDrawer({
  open,
  title,
  onClose,
  returnFocusId,
  widthClassName = "w-[400px]",
  bodyClassName = "p-4",
  positionClassName = "fixed",
  backdropLayerClassName = "z-50",
  panelLayerClassName = "z-[60]",
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  returnFocusId?: string;
  widthClassName?: string;
  bodyClassName?: string;
  positionClassName?: "absolute" | "fixed";
  backdropLayerClassName?: string;
  panelLayerClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const lastView = useRef({ title, children, footer });
  if (open) lastView.current = { title, children, footer };
  const view = open ? { title, children, footer } : lastView.current;
  // Decide the presentation once per opening so the panel never jumps between modes mid-flight.
  const modeRef = useRef<{ docked: boolean; width: number } | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) {
    const requested = Number(/w-\[(\d+)px\]/.exec(widthClassName)?.[1] ?? 400);
    modeRef.current = { docked: canDockDrawer(positionClassName), width: Math.min(requested, Math.round((typeof window === "undefined" ? 1440 : window.innerWidth) * 0.42)) };
  }
  wasOpenRef.current = open;
  const docked = Boolean(modeRef.current?.docked);
  const dockWidth = modeRef.current?.width ?? 400;
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPresent(false), reduced ? 0 : docked ? DRAWER_DOCK_MS : 220);
    return () => window.clearTimeout(timer);
  }, [docked, open]);
  useEffect(() => {
    if (!open || !docked) return;
    const entry = { key: {}, width: dockWidth };
    updateDockStack([...dockStack, entry]);
    return () => updateDockStack(dockStack.filter(item => item !== entry));
  }, [dockWidth, docked, open]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      // A docked drawer sits beside the workspace; a dialog opened later owns Escape first.
      if (docked && document.querySelector(".app-modal-overlay")) return;
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const explicitTarget = returnFocusId ? document.getElementById(returnFocusId) : null;
      if (explicitTarget instanceof HTMLElement) explicitTarget.focus({ preventScroll: true });
      else previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [docked, open, returnFocusId]);

  if (!open && !present) return null;
  const panelBody = <>
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-separator-border px-4">
      <h2 className="text-headline-semibold text-[var(--app-text)]">{view.title}</h2>
      <button
        ref={closeRef}
        type="button"
        aria-label="关闭工具面板"
        title="关闭工具面板"
        onClick={onClose}
        className="grid h-8 w-8 place-items-center rounded-[var(--app-radius-sm)] text-text-secondary transition-colors hover:bg-background-secondary-default hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
    <div className={cx("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{view.children}</div>
    {view.footer && <div className="shrink-0 border-t border-separator-border p-3">{view.footer}</div>}
  </>;
  const dockSlot = docked && typeof document !== "undefined" ? document.getElementById(DRAWER_DOCK_ID) : null;
  if (dockSlot) {
    return createPortal(<PresenceMotion active={open}>
      <aside ref={node => { if (node) node.inert = !open; }} aria-hidden={!open || undefined} data-phase={open ? "open" : "closing"} aria-label={title}
        className="tool-drawer-docked absolute inset-y-0 flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-background-primary-default shadow-[var(--app-shadow-card)]"
        style={{ left: DRAWER_DOCK_GAP, width: dockWidth }}>{panelBody}</aside>
    </PresenceMotion>, dockSlot);
  }
  const drawerContent = (
    <PresenceMotion active={open}>
      <button type="button" aria-label="关闭工具面板" tabIndex={-1} aria-hidden={!open || undefined} data-phase={open ? "open" : "closing"} className={`tool-drawer-backdrop soft-backdrop-enter inset-0 bg-text-primary/10 backdrop-blur-[1px] ${positionClassName} ${backdropLayerClassName}`} onClick={onClose} />
      <aside ref={node => { if (node) node.inert = !open; }} aria-hidden={!open || undefined} data-phase={open ? "open" : "closing"} className={`tool-drawer-enter inset-y-0 right-0 flex max-w-[calc(100%-24px)] flex-col overflow-hidden border-l border-border-button-default bg-background-primary-default shadow-[var(--app-shadow-float)] ${positionClassName} ${panelLayerClassName} ${widthClassName}`} aria-label={title}>
        {panelBody}
      </aside>
    </PresenceMotion>
  );
  return typeof document === "undefined" ? null : createPortal(drawerContent, document.body);
}

/**
 * 文件拖拽上传区组件
 * 支持点击选文件 + 拖拽上传 + 拖入时高亮提示
 */
export function FileDropZone({
  accept,
  onChange,
  children,
  className = "",
}: {
  accept?: string;
  onChange: (file: File | null) => void;
  children: ReactNode;
  className?: string;
}) {
  const appDialog = useAppDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // 只在真正离开整个区域时取消高亮（避免子元素触发）
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // 验证文件类型
      if (accept) {
        const acceptedTypes = accept.split(",").map(t => t.trim());
        const ext = "." + (file.name.split(".").pop() || "");
        if (!acceptedTypes.some(a => ext.toLowerCase() === a.toLowerCase())) {
          await appDialog.notice({ title: "文件类型不受支持", description: `请选择以下格式的文件：${accept}`, confirmLabel: "重新选择" });
          return;
        }
      }
      onChange(file);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    onChange(file);
    e.target.value = ""; // 清空，允许重复选同一文件
  }

  return <>
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cx(
        "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-all",
        isDragging
          ? "border-accent-500 bg-accent-50"
          : "border-border-button-hover bg-background-secondary-default hover:border-border-button-hover hover:bg-background-tertiary-default",
        className,
      )}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleFileChange}
      />
    </label>
    {appDialog.dialog}
  </>;
}
