import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultSeatSettings } from "../state/legacyStateAdapter";
import { createTestStudent } from "../state/testFixtures";
import { SeatBoard } from "./SeatBoard";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderBoard(onMoveStudentToWaiting = vi.fn(), onAssignStudentToSeat = vi.fn()) {
  const students = [createTestStudent("s1", "已入座学生"), createTestStudent("s2", "等待学生")];
  render(
    <SeatBoard
      cardMode="compact"
      students={students}
      seatOrder={["s1", null]}
      seatSettings={createDefaultSeatSettings()}
      onSelectStudent={() => {}}
      onMoveSeat={() => {}}
      onMoveStudentToWaiting={onMoveStudentToWaiting}
      onAssignStudentToSeat={onAssignStudentToSeat}
      lockedSeats={new Set()}
      onToggleLock={() => {}}
    />,
  );
  return { onMoveStudentToWaiting, onAssignStudentToSeat };
}

function mockDragGeometry() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("seat-waiting-dock__bar")) return rect(0, 0, 176, 44);
    if (this.classList.contains("seat-waiting-dock__reveal")) return rect(175, 0, 401, 44);
    if (this.dataset.waitingStudentId) return rect(384, 4, 64, 36);
    const seatIndex = Number(this.dataset.seatIndex);
    if (Number.isInteger(seatIndex)) return rect(240 + seatIndex * 110, 180, 104, 48);
    return rect(0, 0, 0, 0);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SeatBoard waiting dock", () => {
  it("morphs a waiting name into an empty seat and snaps to the real destination", () => {
    vi.useFakeTimers();
    mockDragGeometry();
    const { onAssignStudentToSeat } = renderBoard();
    const dock = screen.getByRole("region", { name: "待排学生" });
    expect(dock).toHaveAttribute("data-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "展开等待区" }));
    expect(dock).toHaveAttribute("data-expanded", "true");

    const waitingStudent = screen.getByRole("button", { name: /等待学生 等待学生/ });
    fireEvent.pointerDown(waitingStudent, { button: 0, pointerId: 3, clientX: 400, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 402, clientY: 204 });
    const overlay = document.querySelector<HTMLElement>('[data-drag-student-id="s2"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute("data-drag-shape", "seat");
    expect(overlay?.style.width).toBe("104px");
    expect(overlay?.style.transform).toContain("translate3d(402px, 204px, 0)");
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 410, clientY: 208 });
    expect(overlay?.style.transform).toContain("translate3d(410px, 208px, 0)");
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 402, clientY: 204 });

    expect(onAssignStudentToSeat).toHaveBeenCalledWith("s2", 1);
    expect(overlay).toHaveAttribute("data-drag-phase", "settling");
    act(() => vi.runAllTimers());
    expect(document.querySelector('[data-drag-student-id="s2"]')).toBeNull();
  });

  it("shrinks a seated card at the dock while staying under the pointer", () => {
    vi.useFakeTimers();
    mockDragGeometry();
    const { onMoveStudentToWaiting } = renderBoard();
    const dock = screen.getByRole("region", { name: "待排学生" });
    const seatedStudent = document.querySelector<HTMLElement>('[data-student-id="s1"]');
    expect(seatedStudent).not.toBeNull();

    fireEvent.pointerDown(seatedStudent as HTMLElement, { button: 0, pointerId: 7, clientX: 260, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 40, clientY: 20 });
    expect(dock).toHaveAttribute("data-expanded", "true");
    expect(dock).toHaveAttribute("data-drop-active", "true");
    const overlay = document.querySelector<HTMLElement>('[data-drag-student-id="s1"]');
    expect(overlay).toHaveAttribute("data-drag-shape", "waiting");
    expect(overlay?.style.width).toBe("64px");
    expect(overlay?.style.height).toBe("36px");
    expect(overlay?.style.transform).toContain("translate3d(40px, 20px, 0)");

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 700, clientY: 100 });
    expect(overlay).toHaveAttribute("data-drag-shape", "seat");
    expect(overlay?.style.width).toBe("104px");
    expect(overlay?.style.transform).toContain("translate3d(700px, 100px, 0)");
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 40, clientY: 20 });

    fireEvent.pointerUp(window, { pointerId: 7, clientX: 40, clientY: 20 });
    expect(onMoveStudentToWaiting).toHaveBeenCalledWith(0);
    expect(overlay).toHaveAttribute("data-drag-phase", "holding");
    expect(overlay?.style.transform).toContain("translate3d(40px, 20px, 0)");
    act(() => vi.advanceTimersByTime(40));
    expect(overlay).toHaveAttribute("data-drag-phase", "settling");
    act(() => vi.runAllTimers());
  });

  it("snaps an invalid waiting drag back to its original small card", () => {
    vi.useFakeTimers();
    mockDragGeometry();
    const { onAssignStudentToSeat } = renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "展开等待区" }));
    const waitingStudent = screen.getByRole("button", { name: /等待学生 等待学生/ });
    fireEvent.pointerDown(waitingStudent, { button: 0, pointerId: 9, clientX: 400, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 402, clientY: 204 });
    fireEvent.pointerCancel(window, { pointerId: 9, clientX: 402, clientY: 204 });

    const overlay = document.querySelector<HTMLElement>('[data-drag-student-id="s2"]');
    expect(onAssignStudentToSeat).not.toHaveBeenCalled();
    expect(overlay).toHaveAttribute("data-drag-phase", "settling");
    expect(overlay).toHaveAttribute("data-drag-shape", "waiting");
    expect(overlay?.style.transform).toContain("translate3d(400px, 20px, 0)");
    act(() => vi.runAllTimers());
  });
});
