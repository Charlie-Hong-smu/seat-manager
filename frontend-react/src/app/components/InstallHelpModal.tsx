import { Monitor, X } from "lucide-react";

interface InstallHelpModalProps {
  message: string;
  onClose: () => void;
}

export function InstallHelpModal({ message, onClose }: InstallHelpModalProps) {
  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="modal-panel-enter w-full max-w-md overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-separator-border flex items-start justify-between">
          <div>
            <div className="text-caption-1-regular text-accent-500 mb-0.5" style={{ fontWeight: 700 }}>桌面快捷入口</div>
            <h2 className="text-text-primary flex items-center gap-2" style={{ fontSize: "1.125rem", fontWeight: 800 }}>
              <Monitor className="w-4 h-4 text-accent-500" />
              安装到桌面
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary-default">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-body-regular text-text-secondary">
          <p className="text-accent-600" style={{ fontWeight: 700 }}>{message}</p>
          <p><span style={{ fontWeight: 700 }}>Chrome / Edge：</span>点击地址栏右侧的安装图标。</p>
          <p><span style={{ fontWeight: 700 }}>Mac Safari：</span>点击分享按钮，再选择添加到 Dock。</p>
          <p><span style={{ fontWeight: 700 }}>iPhone / iPad Safari：</span>点击分享按钮，再选择添加到主屏幕。</p>
        </div>
      </div>
    </div>
  );
}
