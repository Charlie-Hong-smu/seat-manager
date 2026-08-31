import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * 统一按钮组件
 * variant:
 *  - primary: 蓝色主按钮（常用操作）
 *  - ai: 紫色 AI 主按钮（显式智能操作）
 *  - secondary: 灰色次要按钮（取消/返回）
 *  - danger: 红色危险按钮（删除）
 *  - ghost: 透明边框按钮（轻操作）
 */
export function Button({
  variant = "primary",
  size = "md",
  disabled,
  className = "",
  children,
  ...props
}: {
  variant?: "primary" | "ai" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
  };

  const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    ai: "bg-[var(--app-ai)] text-white hover:bg-violet-700 focus-visible:ring-violet-500/30 disabled:bg-violet-300",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    ghost: "bg-transparent border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:border-gray-100 disabled:text-gray-300",
  };

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--app-radius-sm)] font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 disabled:translate-y-0 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  size = "md",
  active = false,
  tone = "default",
  className = "",
  children,
  ...props
}: {
  label: string;
  size?: "xs" | "sm" | "md" | "lg";
  active?: boolean;
  tone?: "default" | "success" | "danger";
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClass = { xs: "h-5 w-5", sm: "h-8 w-8", md: "h-10 w-10", lg: "h-11 w-11" }[size];
  const toneClass = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-100"
    : tone === "danger" ? "border-red-200 bg-red-50 text-red-500 hover:border-red-300 hover:bg-red-100"
      : active ? "border-blue-100 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 place-items-center rounded-[var(--app-radius-sm)] border transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 ${sizeClass} ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
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
    info: "bg-blue-50 text-blue-700",
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-700",
    ai: "bg-violet-50 text-violet-700",
  }[resolvedTone];
  return <p role={resolvedTone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-[var(--app-radius-sm)] px-3 py-2 text-xs font-semibold leading-5 ${toneClass} ${className}`}>{message}</p>;
}

const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// eslint-disable-next-line react-refresh/only-export-components
export function useModalFocus(open: boolean, onEscape: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[autofocus]") || panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) || panel;
    // React 的 autoFocus 不会输出 autofocus 属性；保留已在弹窗内的输入焦点。
    const focusTimer = window.setTimeout(() => { if (!panel?.contains(document.activeElement)) first?.focus(); }, 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(element => !element.hidden);
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
  if (!open) return null;
  return createPortal(<div className="soft-backdrop-enter fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`modal-panel-enter w-full overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow-float)] outline-none ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] p-5"><div><h2 id={titleId} className="text-base font-bold text-[var(--app-text)]">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>}</div><IconButton label="关闭" size="sm" onClick={onClose}><X className="h-4 w-4" /></IconButton></header>
      <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--app-border)] p-4">{footer}</footer>}
    </div>
  </div>, document.body);
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

  if (!open) return null;
  return createPortal(<div className="soft-backdrop-enter fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="modal-panel-enter w-full max-w-sm rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow-float)] outline-none">
      <h2 id={titleId} className="text-base font-bold text-[var(--app-text)]">{title}</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>
      {error && <p role="alert" className="mt-3 rounded-[var(--app-radius-sm)] bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">{showCancel && <Button variant="ghost" onClick={onCancel}>取消</Button>}{alternateLabel && onAlternate && <Button variant="secondary" onClick={onAlternate}>{alternateLabel}</Button>}<Button autoFocus variant={variant} onClick={onConfirm}>{confirmLabel}</Button></div>
    </div>
  </div>, document.body);
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

type AppPromptOptions = AppDialogOptions & { defaultValue?: string; validate?: (value: string) => string | undefined };

function PromptDialog({ open, title, description, defaultValue = "", confirmLabel = "保存", validate, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; defaultValue?: string; confirmLabel?: string; validate?: AppPromptOptions["validate"];
  onCancel: () => void; onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => { if (open) setValue(defaultValue); }, [defaultValue, open]);
  const error = validate?.(value);
  return <ModalShell open={open} title={title} description={description} onClose={onCancel} className="max-w-sm" footer={<><Button variant="ghost" onClick={onCancel}>取消</Button><Button disabled={Boolean(error)} onClick={() => onConfirm(value)}>{confirmLabel}</Button></>}>
    <label className="block text-sm font-semibold text-[var(--app-text-muted)]">名称<input autoFocus value={value} aria-invalid={Boolean(error)} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !error) onConfirm(value); }} className="mt-2 h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 text-[var(--app-text)] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15" /></label>
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
    dialog: <><ConfirmDialog open={Boolean(request)} title={request?.title || "提示"} description={request?.description || ""} confirmLabel={request?.confirmLabel || (request?.mode === "notice" ? "知道了" : "确认")} variant={request?.variant || "primary"} showCancel={request?.mode !== "notice"} onCancel={() => close(false)} onConfirm={() => close(true)} /><PromptDialog open={Boolean(promptRequest)} title={promptRequest?.title || "请输入"} description={promptRequest?.description || ""} defaultValue={promptRequest?.defaultValue} confirmLabel={promptRequest?.confirmLabel} validate={promptRequest?.validate} onCancel={() => { promptRequest?.resolve(null); setPromptRequest(null); }} onConfirm={value => { promptRequest?.resolve(value); setPromptRequest(null); }} /></>,
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

  return <div role="status" aria-live="polite" data-phase={phase} className="action-toast fixed bottom-5 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-sm text-white shadow-2xl">
    <span className="min-w-0">{message}</span>
    {actionLabel && onAction && <button type="button" onClick={() => { onAction(); requestClose(); }} className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-bold transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">{actionIcon}{actionLabel}</button>}
    <button type="button" onClick={requestClose} aria-label="关闭提示" className="shrink-0 text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"><X className="h-4 w-4"/></button>
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
    const timer = window.setInterval(() => setActiveStep(current => Math.min(current + 1, steps.length - 1)), 1200);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return <div className={`ai-generation-panel ai-followup-loading-enter relative overflow-hidden rounded-[var(--app-radius-md)] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-blue-50 text-left ${compact ? "p-3" : "p-4"}`} role="status" aria-live="polite" aria-label={title}>
    <span aria-hidden="true" className="ai-generation-scan absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/75 to-transparent" />
    <div className="relative flex items-center gap-3">
      <span className="ai-generation-core relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200/70"><Sparkles className="h-5 w-5"/><span className="ai-generation-orbit absolute -inset-1 rounded-[18px] border border-violet-300/70"/></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm text-violet-800">{title}</strong><span className="mt-1 block text-xs font-semibold text-violet-600" key={activeStep}>{steps[activeStep] || "正在生成内容"}</span></span>
    </div>
    {!compact && <div className="relative mt-4 grid gap-2 sm:grid-cols-3">{steps.map((step, index) => <div key={step} className={`flex items-center gap-2 rounded-[var(--app-radius-sm)] border px-2.5 py-2 text-[11px] font-semibold transition-colors duration-300 ${index < activeStep ? "border-emerald-100 bg-emerald-50 text-emerald-700" : index === activeStep ? "border-violet-200 bg-white text-violet-700 shadow-sm" : "border-white/70 bg-white/55 text-gray-400"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${index < activeStep ? "bg-emerald-500 text-white" : index === activeStep ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-400"}`}>{index < activeStep ? "✓" : index + 1}</span><span className="truncate">{step}</span></div>)}</div>}
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
    <section className={`${overflow === "visible" ? "overflow-visible" : "overflow-hidden"} rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)] ${className}`}>
      {title && (
        <div className="flex h-16 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
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
  className = "",
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const selectedButton = buttonRefs.current.get(value);
    if (!root || !selectedButton) return;

    const updateIndicator = () => {
      setIndicator({
        left: selectedButton.offsetLeft,
        width: selectedButton.offsetWidth,
        ready: true,
      });
    };
    updateIndicator();

    const observer = new ResizeObserver(updateIndicator);
    observer.observe(root);
    buttonRefs.current.forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [value, options.length]);

  return (
    <div ref={rootRef} role="group" aria-label={ariaLabel} aria-disabled={disabled} className={`relative inline-flex items-center gap-1 rounded-[var(--app-radius-sm)] bg-gray-100 p-1 ${disabled ? "opacity-70" : ""} ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 top-1 rounded-lg bg-white shadow-sm transition-[left,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ left: indicator.left, width: indicator.width, opacity: indicator.ready ? 1 : 0 }}
      />
      {options.map(option => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            ref={node => {
              if (node) buttonRefs.current.set(option.value, node);
              else buttonRefs.current.delete(option.value);
            }}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-[color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-default ${selected ? "text-blue-700" : `text-gray-500 ${disabled ? "" : "hover:text-gray-800"}`}`}
          >
            {option.icon}{option.label}
          </button>
        );
      })}
    </div>
  );
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

  return <div ref={rootRef} role="tablist" aria-label={ariaLabel} className={`relative flex items-center gap-1 border-b border-gray-100 ${className}`}>
    <span aria-hidden="true" className={`pointer-events-none absolute -bottom-px h-0.5 rounded-full transition-[left,width,background-color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${activeOption?.tone === "ai" ? "bg-violet-600" : "bg-blue-600"}`} style={{ left: indicator.left, width: indicator.width, opacity: indicator.ready ? 1 : 0 }} />
    {options.map(option => {
      const selected = option.value === value;
      return <button key={option.value} ref={node => { if (node) buttonRefs.current.set(option.value, node); else buttonRefs.current.delete(option.value); }} type="button" role="tab" aria-selected={selected} onClick={() => onChange(option.value)} className={`relative px-4 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 ${selected ? option.tone === "ai" ? "text-violet-700" : "text-blue-700" : "text-gray-400 hover:text-gray-600"}`}>{option.label}</button>;
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
      closeTimerRef.current = window.setTimeout(() => setPhase("closed"), 240);
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

export function SelectMenu({ value, options, onChange, ariaLabel, placeholder = "请选择", className = "", searchable }: {
  value: string | number;
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = options.find(option => String(option.value) === String(value));
  const showSearch = searchable ?? options.length > 8;
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
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`flex h-10 min-w-0 items-center gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-left text-sm text-[var(--app-text)] transition-colors hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${className}`}>
      <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-[var(--app-text-muted)]"}`}>{selected?.label || placeholder}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    {createPortal(<AnimatedPopover open={open} className="fixed z-[120] overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-2 shadow-[var(--app-shadow-float)]" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}><div ref={panelRef}>
      {showSearch && <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索选项" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white"/></div>}
      <div role="listbox" aria-label={ariaLabel} className="max-h-[min(16rem,var(--select-menu-max-height,16rem))] space-y-1 overflow-y-auto">{filtered.map(option => {
        const active = String(option.value) === String(value);
        return <button key={String(option.value)} type="button" role="option" aria-selected={active} disabled={option.disabled} onClick={() => { onChange(String(option.value)); setOpen(false); setSearch(""); triggerRef.current?.focus(); }} className={`flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-sm transition-colors disabled:opacity-40 ${active ? "bg-blue-50 font-bold text-blue-700" : "text-gray-700 hover:bg-[var(--app-surface-muted)]"}`}><span className="min-w-0 flex-1 truncate text-left">{option.label}</span>{active && <Check className="h-4 w-4 shrink-0"/>}</button>;
      })}{!filtered.length && <div className="py-6 text-center text-sm text-[var(--app-text-muted)]">没有匹配选项</div>}</div>
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

export function DatePicker({ value, onChange, ariaLabel, className = "", min, max }: { value: string; onChange: (value: string) => void; ariaLabel: string; className?: string; min?: string; max?: string }) {
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
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [open]);

  const gridStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - visibleMonth.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const today = formatDateValue(new Date());
  const label = selected ? `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日` : "请选择日期";

  return <>
    <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)} className={`flex h-10 min-w-0 items-center gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-left text-sm transition-colors hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${className}`}><CalendarDays className="h-4 w-4 shrink-0 text-blue-500"/><span className="min-w-0 flex-1 truncate text-[var(--app-text)]">{label}</span><ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}/></button>
    {createPortal(<AnimatedPopover open={open} className="fixed z-[125] w-[304px] rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-3 shadow-[var(--app-shadow-float)]" style={position}><div ref={panelRef} role="dialog" aria-label={ariaLabel}>
      <div className="mb-3 flex items-center justify-between"><IconButton size="sm" label="上个月" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4"/></IconButton><strong className="text-sm text-[var(--app-text)]">{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong><IconButton size="sm" label="下个月" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4"/></IconButton></div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold text-[var(--app-text-muted)]">{"日一二三四五六".split("").map(day => <span key={day} className="py-1">{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">{days.map(day => { const dayValue = formatDateValue(day); const active = dayValue === value; const currentMonth = day.getMonth() === visibleMonth.getMonth(); const disabled = Boolean((min && dayValue < min) || (max && dayValue > max)); return <button key={dayValue} type="button" disabled={disabled} aria-label={dayValue} aria-pressed={active} onClick={() => { onChange(dayValue); setOpen(false); triggerRef.current?.focus(); }} className={`grid h-9 place-items-center rounded-[var(--app-radius-sm)] text-xs transition-colors disabled:opacity-25 ${active ? "bg-blue-600 font-bold text-white" : dayValue === today ? "bg-blue-50 font-bold text-blue-700" : currentMonth ? "text-gray-700 hover:bg-gray-100" : "text-gray-300 hover:bg-gray-50"}`}>{day.getDate()}</button>; })}</div>
      <div className="mt-3 flex justify-between border-t border-gray-100 pt-2"><Button size="sm" variant="ghost" onClick={() => { onChange(""); setOpen(false); }}>清除</Button><Button size="sm" variant="secondary" onClick={() => { onChange(today); setOpen(false); }}>今天</Button></div>
    </div></AnimatedPopover>, document.body)}
  </>;
}

export function ToolDrawer({
  open,
  title,
  onClose,
  returnFocusId,
  widthClassName = "w-[340px]",
  bodyClassName = "p-4",
  positionClassName = "absolute",
  backdropLayerClassName = "z-20",
  panelLayerClassName = "z-30",
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const explicitTarget = returnFocusId ? document.getElementById(returnFocusId) : null;
      if (explicitTarget instanceof HTMLElement) explicitTarget.focus();
      else previousFocusRef.current?.focus();
    };
  }, [open, returnFocusId]);

  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="关闭工具面板" className={`soft-backdrop-enter inset-0 bg-gray-950/10 backdrop-blur-[1px] ${positionClassName} ${backdropLayerClassName}`} onClick={onClose} />
      <aside className={`tool-drawer-enter inset-y-0 right-0 flex max-w-[calc(100%-16px)] flex-col border-l border-[var(--app-border)] bg-white shadow-[var(--app-shadow-float)] ${positionClassName} ${panelLayerClassName} ${widthClassName}`} aria-label={title}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--app-border)] px-4">
          <h2 className="text-base font-bold text-[var(--app-text)]">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="关闭工具面板"
            title="关闭工具面板"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-[var(--app-radius-sm)] border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--app-border)] bg-white p-4">{footer}</div>}
      </aside>
    </>
  );
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
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-all ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
      } ${className}`}
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
