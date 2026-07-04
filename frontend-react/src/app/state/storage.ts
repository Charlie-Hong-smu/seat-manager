// 数据读写入口。
//
// 历史上数据存在单一 localStorage 键 `homeroom-seat-manager-v1`。
// 现在为支持"多班级 / 学期",实际数据被收进文件柜(见 workspaces.ts)的
// "当前选中切片"里。这里把 read/writeLegacyRootState 重定向到当前切片,
// 于是上层所有功能(App.tsx、成绩、座位、AI、备份)无需改动即可按班级/学期隔离。

import { readCurrentSliceData, writeCurrentSliceData } from "./workspaces";

export const LEGACY_STORAGE_KEY = "homeroom-seat-manager-v1";

export function readLegacyRootState(): unknown {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return readCurrentSliceData();
  } catch (error) {
    console.warn("无法读取当前班级数据", error);
    return null;
  }
}

export function writeLegacyRootState(nextState: unknown): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    return writeCurrentSliceData(nextState);
  } catch (error) {
    console.warn("无法保存当前班级数据", error);
    return false;
  }
}
