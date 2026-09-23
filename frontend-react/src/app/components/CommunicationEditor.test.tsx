import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationEditor } from "./CommunicationEditor";
import type { CommunicationDraft } from "../state/types";
afterEach(cleanup);
const props = { scope: "student" as const, studentId: "s1", subjectName: "甲", startDate: "2026-09-21", endDate: "2026-09-27", facts: ["出勤正常"] };
describe("communication draft lifecycle", () => {
  it("restores edits after reopening without silently saving teacher data", () => {
    const onSave = vi.fn<(draft: CommunicationDraft) => boolean>(() => true);
    const panel = render(<CommunicationEditor {...props} onSave={onSave}/>);
    fireEvent.change(screen.getByRole("textbox", { name: "沟通稿正文" }), { target: { value: "老师手工修改" } });
    panel.unmount(); render(<CommunicationEditor {...props} onSave={onSave}/>);
    expect(screen.getByRole("textbox", { name: "沟通稿正文" })).toHaveValue("老师手工修改");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存沟通稿" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ content: "老师手工修改", deliveryStatus: "draft", studentId: "s1" });
  });
  it("requires saving edits before marking communication and preserves identity", () => {
    const saved: CommunicationDraft = { ...props, id: "c1", content: "正文", generatedBy: "local", sourceDigest: "x", updatedAt: "2026-09-22T00:00:00Z", deliveryStatus: "draft" };
    const onSave = vi.fn<(draft: CommunicationDraft) => boolean>(() => true);
    render(<CommunicationEditor {...props} saved={saved} onSave={onSave}/>);
    fireEvent.click(screen.getByRole("button", { name: "标记已沟通" }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "c1", deliveryStatus: "shared", channel: "私聊" });
    fireEvent.change(screen.getByRole("textbox", { name: "沟通稿正文" }), { target: { value: "新正文" } });
    expect(screen.getByRole("button", { name: "标记已沟通" })).toBeDisabled();
  });
});
