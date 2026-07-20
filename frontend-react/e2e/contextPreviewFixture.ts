import type { Page } from "@playwright/test";

export async function seedContextPreviewRecords(page: Page, studentName: string) {
  return page.evaluate(name => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    const current = book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId);
    const student = current?.data?.students?.find((item: { name: string }) => item.name === name);
    if (!current || !student) throw new Error(`无法为 ${name} 写入 E2E 预览数据`);
    current.data.followupTasks = [
      {
        id: "context-task-a",
        studentId: student.id,
        title: "上下文任务甲",
        type: "学业关注",
        description: "与数学老师确认课堂表现。",
        plannedDate: "2026-07-20",
        dueDate: "2026-07-22",
        status: "pending",
        source: "manual",
        createdAt: "2026-07-20T08:00:00.000Z",
        updatedAt: "2026-07-20T08:00:00.000Z",
      },
      {
        id: "context-task-b",
        studentId: student.id,
        title: "上下文任务乙",
        type: "家校沟通",
        description: "联系家长了解近期作息。",
        plannedDate: "2026-07-21",
        dueDate: "2026-07-23",
        status: "pending",
        source: "manual",
        createdAt: "2026-07-20T09:00:00.000Z",
        updatedAt: "2026-07-20T09:00:00.000Z",
      },
    ];
    current.data.activityEvents = [{
      id: "context-event-a",
      action: "created",
      ref: { domain: "followup", entityId: "context-task-a", studentId: student.id },
      studentIds: [student.id],
      title: "创建上下文任务甲",
      detail: "来源：手动创建",
      occurredAt: "2026-07-20T08:00:00.000Z",
    }];
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
    return student.id as string;
  }, studentName);
}
