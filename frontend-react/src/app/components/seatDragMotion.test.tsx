import { useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultSeatSettings } from "../state/legacyStateAdapter";
import { createDefaultSeatLayout } from "../state/seatLayout";
import { evaluateSeatOrder, type SeatOrder } from "../state/seatPlanner";
import { createTestStudent } from "../state/testFixtures";
import { SeatBoard } from "./SeatBoard";
import { SeatShufflePreview } from "./SeatShufflePreview";

const students = [createTestStudent("s1", "学生甲"), createTestStudent("s2", "学生乙"), createTestStudent("s3", "学生丙")];
const initialOrder: SeatOrder = ["s1", null, "s2", "s3", null, null, null, null];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(["board", "preview"] as const)("%s empty-seat motion", surface => {
  describe.each(["default", "custom"] as const)("%s layout", layoutType => {
    function setup() {
      vi.useFakeTimers();
      vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
      vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
      const animate = vi.fn();
      const selector = surface === "board" ? "data-seat-index" : "data-preview-seat-index";
      const studentAttribute = surface === "board" ? "data-student-id" : "data-preview-student-id";
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const index = this.getAttribute(selector);
        const left = index === null ? 0 : 240 + Number(index) * 110;
        return { left, top: 180, right: left + 104, bottom: 228, width: 104, height: 48, x: left, y: 180, toJSON: () => ({}) };
      });
      const onCommit = vi.fn();
      function Harness() {
        const [order, setOrder] = useState(initialOrder);
        const settings = { ...createDefaultSeatSettings(), ...(layoutType === "custom" ? { layout: createDefaultSeatLayout(8) } : {}) };
        function commit(next: SeatOrder) {
          onCommit(next);
          setOrder(next);
        }
        return surface === "board" ? (
          <SeatBoard cardMode="compact" students={students} seatOrder={order} seatSettings={settings}
            onMoveSeat={(from, to) => { const next = [...order]; [next[from], next[to]] = [next[to], next[from]]; commit(next); }}
            onSelectStudent={() => {}} onMoveStudentToWaiting={() => {}} onAssignStudentToSeat={() => {}}
            lockedSeats={new Set()} onToggleLock={() => {}} />
        ) : (
          <SeatShufflePreview students={students} currentOrder={initialOrder} candidate={{ order, evaluation: evaluateSeatOrder(students, order, settings) }}
            seatSettings={settings} onOrderChange={commit} onRegenerate={() => {}} onApply={() => {}} onClose={() => {}} />
        );
      }
      render(<Harness />);
      const seat = (index: number) => document.querySelector<HTMLElement>(`[${selector}="${index}"]`)!;
      for (let index = 0; index < 8; index++) seat(index).animate = animate;
      const move = (index: number) => fireEvent.pointerMove(window, { pointerId: 1, clientX: 292 + index * 110, clientY: 204 });
      const drop = (index: number) => {
        fireEvent.pointerUp(window, { pointerId: 1, clientX: 292 + index * 110, clientY: 204 });
        act(() => vi.advanceTimersByTime(500));
        act(() => vi.runAllTimers());
      };
      fireEvent.pointerDown(seat(0), { button: 0, pointerId: 1, clientX: 292, clientY: 204 });
      return { seat, move, drop, animate, onCommit, studentAttribute };
    }

    it("keeps empty targets and neighbors fixed, with one snap and no second fade", () => {
      const { seat, move, drop, animate, onCommit, studentAttribute } = setup();
      const source = seat(0);
      const entrance = source.parentElement;
      move(2);
      expect(seat(2).style.transform).not.toBe("");
      expect(seat(3).style.transform).not.toBe("");
      expect(seat(1).style.transform).toBe("");
      move(1);
      for (let index = 0; index < 8; index++) expect(seat(index).style.transform).toBe("");
      expect(onCommit).not.toHaveBeenCalled();
      drop(1);
      expect(onCommit).toHaveBeenCalledExactlyOnceWith([null, "s1", "s2", "s3", null, null, null, null]);
      expect(seat(0)).toBe(source);
      expect(seat(0).parentElement).toBe(entrance);
      expect(seat(0)).not.toHaveAttribute(studentAttribute);
      expect(seat(0)).not.toHaveClass("seat-card-enter");
      expect(seat(0)).not.toHaveClass("opacity-25");
      expect(seat(1)).toHaveAttribute(studentAttribute, "s1");
      expect(animate).not.toHaveBeenCalled();
      if (surface === "board") {
        expect(entrance).toHaveClass("seat-card-enter");
        expect(seat(1)).not.toHaveClass("seat-card-enter");
      } else {
        expect(seat(0).style.transitionProperty).not.toContain("opacity");
      }
    });

    it("retains displacement and both landing animations for an occupied-seat swap", () => {
      const { seat, move, drop, animate, onCommit } = setup();
      move(2);
      expect(seat(2).style.transform).not.toBe("");
      expect(seat(3).style.transform).not.toBe("");
      expect(seat(1).style.transform).toBe("");
      drop(2);
      expect(onCommit).toHaveBeenCalledExactlyOnceWith(["s2", null, "s1", "s3", null, null, null, null]);
      expect(animate).toHaveBeenCalledTimes(2);
    });
  });
});
