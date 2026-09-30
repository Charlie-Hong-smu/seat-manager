import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFollowupTask } from "../state/dailyManagement";
import { LinkedTaskBadge, SourceLink } from "./LinkedWorkflow";

describe("linked workflow actions", () => {
  it("opens a followup without triggering its containing registration surface", () => {
    const parent = vi.fn(); const open = vi.fn(); const task = createFollowupTask({ studentId: "s1", title: "补交" });
    render(<div onClick={parent}><LinkedTaskBadge task={task} onOpen={open}/></div>);
    fireEvent.click(screen.getByRole("button", { name: "已有跟进" }));
    expect(open).toHaveBeenCalledWith(task.id); expect(parent).not.toHaveBeenCalled();
  });
  it("opens a source without triggering another business action", () => {
    const parent = vi.fn(); const open = vi.fn(); const ref = { domain: "homework" as const, entityId: "h" };
    render(<div onClick={parent}><SourceLink source="homework" sourceRef={ref} onOpen={open}/></div>);
    fireEvent.click(screen.getByRole("button", { name: "打开作业来源" }));
    expect(open).toHaveBeenCalledWith(ref); expect(parent).not.toHaveBeenCalled();
  });
});
