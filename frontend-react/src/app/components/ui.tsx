import { type ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

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

/**
 * 统一卡片/面板组件
 */
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)] ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SegmentedControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex items-center gap-1 rounded-[var(--app-radius-sm)] bg-gray-100 p-1 ${className}`}>
      {options.map(option => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${selected ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            {option.icon}{option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToolDrawer({
  open,
  title,
  onClose,
  returnFocusId,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  returnFocusId?: string;
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
      <button type="button" aria-label="关闭工具面板" className="soft-backdrop-enter absolute inset-0 z-20 bg-gray-950/10 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="tool-drawer-enter absolute inset-y-0 right-0 z-30 flex w-[340px] max-w-[calc(100%-16px)] flex-col border-l border-[var(--app-border)] bg-white shadow-[var(--app-shadow-float)]" aria-label={title}>
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
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

  function handleDrop(e: React.DragEvent) {
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
          alert(`不支持的文件类型。仅支持：${accept}`);
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

  return (
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
  );
}
