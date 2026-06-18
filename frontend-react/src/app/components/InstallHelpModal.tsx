import { Monitor, X } from "lucide-react";

interface InstallHelpModalProps {
  message: string;
  onClose: () => void;
}

export function InstallHelpModal({ message, onClose }: InstallHelpModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="text-xs text-blue-500 mb-0.5" style={{ fontWeight: 700 }}>桌面快捷入口</div>
            <h2 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.125rem", fontWeight: 800 }}>
              <Monitor className="w-4 h-4 text-blue-500" />
              安装到桌面
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-600">
          <p className="text-blue-600" style={{ fontWeight: 700 }}>{message}</p>
          <p><span style={{ fontWeight: 700 }}>Chrome / Edge：</span>点击地址栏右侧的安装图标。</p>
          <p><span style={{ fontWeight: 700 }}>Mac Safari：</span>点击分享按钮，再选择添加到 Dock。</p>
        </div>
      </div>
    </div>
  );
}
