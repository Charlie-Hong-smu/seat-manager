import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChartViewport } from "./ChartViewport";

let resize: ResizeObserverCallback;
let bounds: DOMRect;
beforeEach(() => {
  bounds = new DOMRect(0, 0, 600, 300);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => bounds);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("commits new data without layout reads and uses current data when its container later resizes", () => {
  const chart = (value: string) => <ChartViewport height={240}>{(width, height) => <output>{`${value}:${width}x${height}`}</output>}</ChartViewport>;
  const { container, rerender } = render(chart("语文"));
  expect(screen.getByText("语文:600x240")).toBeInTheDocument();
  const reads = vi.mocked(Element.prototype.getBoundingClientRect);
  reads.mockClear();
  rerender(chart("数学"));
  expect(screen.getByText("数学:600x240")).toBeInTheDocument();
  expect(reads).not.toHaveBeenCalled();
  act(() => resize([{ target: container.querySelector('[data-chart-viewport]')!, contentRect: new DOMRect(0, 0, 480, 240) } as ResizeObserverEntry], {} as ResizeObserver));
  expect(screen.getByText("数学:480x240")).toBeInTheDocument();
  expect(reads).not.toHaveBeenCalled();
});

it("commits changed dimensions and data together before painting a different chart layout", () => {
  const draws: string[] = [];
  const chart = (single: boolean) => <ChartViewport height={single ? 240 : "fill"} minWidth={single ? 0 : 650}>{(width, height) => {
    const value = `${single ? "single" : "total"}:${width}x${height}`;
    draws.push(value);
    return <output>{value}</output>;
  }}</ChartViewport>;
  const { rerender } = render(chart(false));
  expect(screen.getByText("total:650x300")).toBeInTheDocument();
  bounds = new DOMRect(0, 0, 900, 240);
  rerender(chart(true));
  expect(screen.getByText("single:900x240")).toBeInTheDocument();
  expect(draws.filter(value => value.startsWith("single:"))).toEqual(["single:900x240"]);
});
