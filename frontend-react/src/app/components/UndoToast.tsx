import { RotateCcw, X } from "lucide-react";

export function UndoToast({ message, onUndo, onClose }: { message: string; onUndo: () => void; onClose: () => void }) {
  return <div role="status" className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-sm text-white shadow-2xl modal-panel-enter"><span>{message}</span><button type="button" onClick={onUndo} className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-bold hover:bg-white/20"><RotateCcw className="h-3.5 w-3.5"/>撤销</button><button type="button" onClick={onClose} aria-label="关闭" className="text-white/60 hover:text-white"><X className="h-4 w-4"/></button></div>;
}
