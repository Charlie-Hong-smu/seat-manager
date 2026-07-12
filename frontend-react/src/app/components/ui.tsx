import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * 统一按钮组件
 * variant:
 *  - primary: 蓝色主按钮（常用操作）
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
  variant?: "primary" | "secondary" | "danger" | "ghost";
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
  className = "",
  children,
  ...props
}: {
  label: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClass = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-11 w-11" }[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 place-items-center rounded-[var(--app-radius-sm)] border transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 ${sizeClass} ${active ? "border-blue-100 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800"} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
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
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return <div className="soft-backdrop-enter fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" className="modal-panel-enter w-full max-w-sm rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow-float)]">
      <h2 id="confirm-dialog-title" className="text-base font-bold text-[var(--app-text)]">{title}</h2>
      <p id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>
      {error && <p role="alert" className="mt-3 rounded-[var(--app-radius-sm)] bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">{showCancel && <Button variant="ghost" onClick={onCancel}>取消</Button>}{alternateLabel && onAlternate && <Button variant="secondary" onClick={onAlternate}>{alternateLabel}</Button>}<Button autoFocus variant={variant} onClick={onConfirm}>{confirmLabel}</Button></div>
    </div>
  </div>;
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

// 与 ConfirmDialog 共置，确保所有业务确认都从唯一设计系统入口创建。
// eslint-disable-next-line react-refresh/only-export-components
export function useAppDialog() {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
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
    dialog: <ConfirmDialog open={Boolean(request)} title={request?.title || "提示"} description={request?.description || ""} confirmLabel={request?.confirmLabel || (request?.mode === "notice" ? "知道了" : "确认")} variant={request?.variant || "primary"} showCancel={request?.mode !== "notice"} onCancel={() => close(false)} onConfirm={() => close(true)} />,
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
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
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
      setPosition({ left: rect.left, top: opensUp ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8, width: rect.width, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);

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
    {open && createPortal(<div ref={panelRef} className="app-popover-enter fixed z-[120] overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-2 shadow-[var(--app-shadow-float)]" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {showSearch && <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索选项" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white"/></div>}
      <div role="listbox" aria-label={ariaLabel} className="max-h-[min(16rem,var(--select-menu-max-height,16rem))] space-y-1 overflow-y-auto">{filtered.map(option => {
        const active = String(option.value) === String(value);
        return <button key={String(option.value)} type="button" role="option" aria-selected={active} disabled={option.disabled} onClick={() => { onChange(String(option.value)); setOpen(false); setSearch(""); triggerRef.current?.focus(); }} className={`flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-sm transition-colors disabled:opacity-40 ${active ? "bg-blue-50 font-bold text-blue-700" : "text-gray-700 hover:bg-[var(--app-surface-muted)]"}`}><span className="min-w-0 flex-1 truncate text-left">{option.label}</span>{active && <Check className="h-4 w-4 shrink-0"/>}</button>;
      })}{!filtered.length && <div className="py-6 text-center text-sm text-[var(--app-text-muted)]">没有匹配选项</div>}</div>
    </div>, document.body)}
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
