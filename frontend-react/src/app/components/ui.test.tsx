import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ui";

describe("ConfirmDialog", () => {
  it("portals the dialog to the document body so nested surfaces cannot offset or clip it", () => {
    const onConfirm = vi.fn();
    render(
      <div data-testid="nested-surface" style={{ transform: "translateY(20px)", overflow: "hidden" }}>
        <ConfirmDialog
          open
          title="确认操作？"
          description="确认弹窗应相对整个视口居中。"
          variant="primary"
          onCancel={() => {}}
          onConfirm={onConfirm}
        />
      </div>,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByTestId("nested-surface")).not.toContainElement(dialog);

    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
