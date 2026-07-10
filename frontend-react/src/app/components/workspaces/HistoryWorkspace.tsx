import { useState } from "react";
import { Save } from "lucide-react";
import type { SeatHistorySnapshot } from "../../state/types";
import { WorkspacePanel } from "./WorkspacePanel";

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "未记录时间" : date.toLocaleString("zh-CN", { hour12: false });
}

export function HistoryWorkspace({ history, onSave, onRename, onView, onApply, onDelete }: {
  history: SeatHistorySnapshot[];
  onSave: (note: string) => void;
  onRename: (id: string, note: string) => void;
  onView: (snapshot: SeatHistorySnapshot) => void;
  onApply: (snapshot: SeatHistorySnapshot) => void;
  onDelete: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  function save() {
    if (!note.trim()) return;
    onSave(note);
    setNote("");
  }
  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <WorkspacePanel title="保存当前座位">
          <div className="space-y-3">
            <input value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="记录名称，例如：期中后调整" />
            <button onClick={save} disabled={!note.trim()} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300" style={{ fontWeight: 800 }}><Save className="mr-1.5 inline h-4 w-4 -mt-0.5" />保存座位</button>
          </div>
        </WorkspacePanel>
        <WorkspacePanel title="历史列表">
          <div className="overflow-hidden rounded-xl border border-gray-100">
            {history.map((snapshot) => (
              <div key={snapshot.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  {renamingId === snapshot.id ? <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm outline-none" /> : <div className="truncate text-sm text-gray-800" style={{ fontWeight: 900 }}>{snapshot.note || "未命名座位"}</div>}
                  <div className="mt-1 text-xs text-gray-400">{formatHistoryTime(snapshot.time)} · {snapshot.rows} 排</div>
                </div>
                <div className="flex items-center gap-2">
                  {renamingId === snapshot.id ? <button onClick={() => { onRename(snapshot.id, renameValue); setRenamingId(""); }} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white" style={{ fontWeight: 800 }}>保存</button> : <button onClick={() => { setRenamingId(snapshot.id); setRenameValue(snapshot.note); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>命名</button>}
                  <button onClick={() => onView(snapshot)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>查看</button>
                  <button onClick={() => onApply(snapshot)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>恢复</button>
                  <button onClick={() => onDelete(snapshot.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100" style={{ fontWeight: 800 }}>删除</button>
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="px-4 py-12 text-center text-sm text-gray-400">暂无历史记录</div>}
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
