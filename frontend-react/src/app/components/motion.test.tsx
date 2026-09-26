import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { MotionCollapse, MotionList, MotionSwitch, PresenceMotion } from "./motion";

let reduce = false;
let flights: Array<{ cancel: ReturnType<typeof vi.fn>; complete: () => void }>;
beforeEach(() => {
  reduce = false;
  flights = [];
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 300, 100));
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn(() => {
    let complete!: () => void;
    const finished = new Promise<void>(resolve => { complete = resolve; });
    const flight = { cancel: vi.fn(), complete };
    flights.push(flight);
    return { finished, cancel: flight.cancel };
  }) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared continuous motion", () => {
  it("keeps inert outgoing pixels without mounting business effects or duplicate IDs", async () => {
    const mounted = vi.fn();
    const clicked = vi.fn();
    function Content({ label }: { label: string }) {
      useEffect(() => { mounted(); }, []);
      return <button id="live-action" onClick={clicked}>{label}</button>;
    }
    const { container, rerender } = render(<MotionSwitch transitionKey="a"><Content label="甲" /></MotionSwitch>);
    rerender(<MotionSwitch transitionKey="b"><Content label="乙" /></MotionSwitch>);
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('#live-action')).toHaveLength(1);
    const ghost = container.querySelector('.app-motion-snapshot') as HTMLElement;
    expect(ghost.inert).toBe(true);
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '乙' }));
    expect(clicked).toHaveBeenCalledTimes(1);
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector('.app-motion-snapshot')).toBeNull();
  });

  it("cancels interrupted flights on replacement and releases them on unmount", () => {
    const { rerender, unmount } = render(<MotionSwitch transitionKey={1}>一</MotionSwitch>);
    rerender(<MotionSwitch transitionKey={2}>二</MotionSwitch>);
    const old = [...flights];
    rerender(<MotionSwitch transitionKey={3}>三</MotionSwitch>);
    expect(old.every(flight => flight.cancel.mock.calls.length > 0)).toBe(true);
    unmount();
    expect(flights.every(flight => flight.cancel.mock.calls.length > 0)).toBe(true);
  });

  it("does not snap to the endpoint when a live field is focused or pressed mid-flight", () => {
    const { container, rerender } = render(<MotionSwitch transitionKey="a"><input aria-label="字段" /></MotionSwitch>);
    rerender(<MotionSwitch transitionKey="b"><input aria-label="字段" /></MotionSwitch>);
    const input = screen.getByRole("textbox", { name: "字段" });
    fireEvent.pointerDown(input);
    fireEvent.focus(input);
    expect(container.querySelector(".app-motion-snapshot")).not.toBeNull();
    expect(flights.every(flight => flight.cancel.mock.calls.length === 0)).toBe(true);
  });

  it("morphs matching surfaces without scaling their text or duplicating live controls", async () => {
    const { container, rerender } = render(<MotionSwitch transitionKey="quick" sharedLayout><button data-motion-surface="student-a" id="student-a">甲</button></MotionSwitch>);
    // Surfaces actually move: same-footprint morphs are skipped on purpose.
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      if (this.getAttribute?.("data-motion-surface") === "student-a") return this.tagName === "BUTTON" ? new DOMRect(0, 0, 300, 100) : new DOMRect(40, 20, 200, 140);
      return new DOMRect(0, 0, 300, 100);
    });
    rerender(<MotionSwitch transitionKey="detail" sharedLayout><div data-motion-surface="student-a"><input id="student-a" aria-label="甲备注" /></div></MotionSwitch>);
    const frame = container.querySelector(".app-motion-surface");
    expect(frame).not.toBeNull();
    expect(container.querySelectorAll("#student-a")).toHaveLength(1);
    frame?.querySelectorAll<HTMLElement>(".app-motion-snapshot").forEach(node => {
      expect(node.inert).toBe(true);
      expect(node.style.transform).toBe("none");
    });
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector(".app-motion-surface")).toBeNull();
    expect(screen.getByRole("textbox", { name: "甲备注" })).toBeVisible();
  });

  it("refreshes arriving chart pixels after measurement and keeps SVG references local", async () => {
    const chart = (id: string) => <div data-motion-surface="chart"><svg><defs><clipPath id={id}><rect width="100" height="100" /></clipPath></defs><g clipPath={`url(#${id})`}><path d="M0 0H10V10Z" /></g></svg></div>;
    const { container, rerender } = render(<MotionSwitch transitionKey="a" sharedLayout>{chart("chart-a")}</MotionSwitch>);
    // Surfaces actually move: same-footprint morphs are skipped on purpose.
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      if (this.getAttribute?.("data-motion-surface") === "chart") return this.querySelector("clipPath")?.id === "chart-a" ? new DOMRect(0, 0, 300, 100) : new DOMRect(40, 20, 200, 140);
      return new DOMRect(0, 0, 300, 100);
    });
    rerender(<MotionSwitch transitionKey="b" sharedLayout>{chart("chart-b")}</MotionSwitch>);
    const live = container.querySelector<HTMLElement>(".app-motion-content > [data-motion-surface]")!;
    const arriving = container.querySelector<HTMLElement>(".app-motion-surface > .app-motion-snapshot")!;
    const localClip = arriving.querySelector("clipPath")!;
    expect(localClip.id).not.toBe("chart-b");
    expect(arriving.querySelector("g")!.getAttribute("clip-path")).toBe(`url(#${localClip.id})`);
    await act(async () => { live.querySelector("path")!.setAttribute("d", "M0 0H80V60Z"); });
    expect(arriving.querySelector("path")!.getAttribute("d")).toBe("M0 0H80V60Z");
    const ids = [...container.querySelectorAll("[id]")].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector(".app-motion-surface")).toBeNull();
    await act(async () => { live.querySelector("path")!.setAttribute("d", "M0 0H90V60Z"); });
    expect(arriving.querySelector("path")!.getAttribute("d")).toBe("M0 0H80V60Z");
  });

  it("keeps partially departed rows visible until a rapid filter handoff finishes", async () => {
    const { container, rerender } = render(<MotionList><div key="a">甲</div><div key="b">乙</div></MotionList>);
    rerender(<MotionList><div key="b">乙</div></MotionList>);
    const departing = container.querySelector<HTMLElement>(".app-motion-snapshot")!;
    departing.style.opacity = "0.4";
    rerender(<MotionList><div key="c">丙</div></MotionList>);
    expect(container.querySelectorAll(".app-motion-snapshot")).toHaveLength(2);
    expect(container.querySelector<HTMLElement>(".app-motion-snapshot")!.style.opacity).toBe("0.4");
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector(".app-motion-snapshot")).toBeNull();
    expect(container.textContent).toBe("丙");
  });

  it("moves ordered record content inside fixed shells and reverses from the visible composite", async () => {
    const record = (key: number) => <MotionSwitch transitionKey={key} contentIndex={key} fixed><div data-testid="frame"><span data-motion-shift>{key}</span></div></MotionSwitch>;
    const { container, rerender } = render(record(0));
    rerender(record(1));
    const animate = vi.mocked(Element.prototype.animate);
    const live = container.querySelector(".app-motion-content [data-motion-shift]")!;
    const moving = animate.mock.contexts.indexOf(live);
    expect(animate.mock.calls[moving][0]).toEqual([{ transform: "translateY(24px)" }, { transform: "translateY(0)" }]);
    expect(animate.mock.calls[moving][1]).toMatchObject({ duration: 400 });
    expect(animate.mock.contexts).not.toContain(container.querySelector(".app-motion-content [data-testid=frame]"));
    const oldFlights = [...flights];
    rerender(record(0));
    expect(oldFlights.every(flight => flight.cancel.mock.calls.length)).toBe(true);
    expect(animate.mock.calls[animate.mock.calls.length - 1][0]).toEqual([{ transform: "translateY(-24px)" }, { transform: "translateY(0)" }]);
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector(".app-motion-snapshot")).toBeNull();
  });

  it("lets sidebar selection lead the page and reverses navigation without a second pause", async () => {
    const { container, rerender } = render(<MotionSwitch navigationIndex={0} transitionKey="today" fixed>今日</MotionSwitch>);
    rerender(<MotionSwitch navigationIndex={2} transitionKey="attendance" fixed><button>出勤</button></MotionSwitch>);
    const live = container.querySelector<HTMLElement>(":scope > .app-motion-switch > .app-motion-content")!;
    expect(live.inert).toBe(true);
    let calls = vi.mocked(Element.prototype.animate).mock.calls;
    expect(calls[0][0]).toEqual([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }]);
    expect(calls[0][1]).toMatchObject({ duration: 400 });
    expect((calls[0][1] as KeyframeAnimationOptions).delay).toBeGreaterThan(0);
    rerender(<MotionSwitch navigationIndex={1} transitionKey="daily" fixed><button>座位</button></MotionSwitch>);
    calls = vi.mocked(Element.prototype.animate).mock.calls;
    expect(calls[2][0]).toEqual([{ transform: "translateY(-40px)" }, { transform: "translateY(0)" }]);
    expect(calls[2][1]).toMatchObject({ delay: 0 });
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.querySelector<HTMLElement>(".app-motion-content")!.inert).toBe(false);
    expect(container.querySelector(".app-motion-snapshot")).toBeNull();
  });

  it("keeps the previous page until a lazy destination is ready and abandons stale loads", async () => {
    const { container, rerender } = render(<MotionSwitch navigationIndex={1} transitionKey="daily" fixed>座位</MotionSwitch>);
    rerender(<MotionSwitch navigationIndex={5} transitionKey="scores" fixed><div data-motion-pending>加载</div></MotionSwitch>);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".app-motion-snapshot")).toHaveTextContent("座位");
    expect(flights).toHaveLength(0);
    const pending = container.querySelector("[data-motion-pending]")!;
    await act(async () => { pending.removeAttribute("data-motion-pending"); });
    expect(flights).toHaveLength(2);
    rerender(<MotionSwitch navigationIndex={6} transitionKey="funds" fixed><div data-motion-pending>加载</div></MotionSwitch>);
    const abandoned = container.querySelector(":scope > .app-motion-switch > .app-motion-content [data-motion-pending]")!;
    rerender(<MotionSwitch navigationIndex={0} transitionKey="today" fixed>今日</MotionSwitch>);
    const count = flights.length;
    await act(async () => { abandoned.removeAttribute("data-motion-pending"); });
    expect(flights).toHaveLength(count);
    await act(async () => { flights.forEach(flight => flight.complete()); });
    expect(container.textContent).toBe("今日");
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
  });

  it("retains closing fields until collapse ends and handles rapid reopening", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<MotionCollapse open><input aria-label="备注" defaultValue="草稿" /></MotionCollapse>);
    rerender(<MotionCollapse open={false}>{null}</MotionCollapse>);
    expect(container.querySelector('input')?.value).toBe('草稿');
    expect(container.firstElementChild).toHaveAttribute('inert');
    act(() => { vi.advanceTimersByTime(100); });
    rerender(<MotionCollapse open><input aria-label="备注" defaultValue="草稿" /></MotionCollapse>);
    act(() => { vi.advanceTimersByTime(350); });
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('草稿');
    rerender(<MotionCollapse open={false}>{null}</MotionCollapse>);
    act(() => { vi.advanceTimersByTime(350); });
    expect(container.querySelector('input')).toBeNull();
  });

  it("bypasses geometry and overlay flights when reduced motion is requested", () => {
    reduce = true;
    const { rerender, container } = render(<><MotionSwitch transitionKey="a">甲</MotionSwitch><MotionList><div key="a">甲</div></MotionList><PresenceMotion active><div className="modal-panel-enter">弹窗</div></PresenceMotion></>);
    rerender(<><MotionSwitch transitionKey="b">乙</MotionSwitch><MotionList><div key="b">乙</div></MotionList><PresenceMotion active={false}><div className="modal-panel-enter">弹窗</div></PresenceMotion></>);
    expect(flights).toHaveLength(0);
    expect(container.querySelector('.app-motion-snapshot')).toBeNull();
  });
});
