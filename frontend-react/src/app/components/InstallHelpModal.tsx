import { ModalShell } from "./ui";

export function InstallHelpModal({ open, message, onClose }: { open: boolean; message: string; onClose: () => void }) {
  return <ModalShell open={open} title="安装到桌面" onClose={onClose} className="max-w-md"><div className="space-y-3 text-body-regular text-text-secondary"><p className="font-bold text-accent-600">{message}</p><p><strong>Chrome / Edge：</strong>点击地址栏右侧的安装图标。</p><p><strong>Mac Safari：</strong>点击分享按钮，再选择添加到 Dock。</p><p><strong>iPhone / iPad Safari：</strong>点击分享按钮，再选择添加到主屏幕。</p></div></ModalShell>;
}
