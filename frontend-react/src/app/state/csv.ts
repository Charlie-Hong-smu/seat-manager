// 共享 CSV 构建与下载。带 BOM 让 Excel 正确识别 UTF-8 中文。
export function buildCsvContent(rows: string[][]): string {
  return `﻿${rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
}

export function downloadCsvFile(filename: string, content: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
