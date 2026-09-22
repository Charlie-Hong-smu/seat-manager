import { useLayoutEffect, useRef, useState } from "react";

const DURATION = 440;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type Snapshot = { key: string; rect: DOMRect; content: HTMLElement };

function cells(layer: HTMLElement) {
  return Array.from(layer.querySelectorAll<HTMLElement>(
    "[data-seat-layout-node], [data-seat-grid-seat], [data-seat-layout-podium], .seat-layout-editor-cell[data-podium='true']",
  )).map(element => ({
    element,
    key: element.dataset.seatLayoutNode || element.dataset.seatGridSeat || "podium",
  }));
}

/** Measure once at each end; only transform/opacity run during the transition. */
export function useSeatModeTransition() {
  const [editingLayout, setEditingLayout] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const seatPanelRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<Snapshot[]>([]);
  const busyRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  function switchLayoutEditing(next: boolean) {
    if (next === editingLayout || busyRef.current) return;
    const panel = seatPanelRef.current;
    const source = panel?.querySelector<HTMLElement>(editingLayout ? "[data-seat-designer-layer]" : "[data-seat-board-layer]");
    const animate = source && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    snapshotRef.current = animate ? cells(source).map(({ element, key }) => ({
      key, rect: element.getBoundingClientRect(), content: element.cloneNode(true) as HTMLElement,
    })) : [];
    busyRef.current = Boolean(animate);
    setTransitioning(Boolean(animate));
    setEditingLayout(next);
    if (!animate && !next) requestAnimationFrame(() => document.getElementById("seat-layout-editor-trigger")?.focus({ preventScroll: true }));
  }

  useLayoutEffect(() => {
    if (!transitioning) return;
    const panel = seatPanelRef.current;
    const target = panel?.querySelector<HTMLElement>(editingLayout ? "[data-seat-designer-layer]" : "[data-seat-board-layer]");
    if (!panel || !target) return;
    panel.dataset.seatModeTransition = "true";
    // Keep initial entrance effects suppressed after handoff too. These nodes are
    // replaced on subsequent slot toggles, so normal editing feedback survives.
    target.querySelectorAll<HTMLElement>(".seat-card-enter, .seat-layout-slot--active").forEach(element => { element.style.animation = "none"; });
    const origin = panel.getBoundingClientRect();
    const snapshots = new Map(snapshotRef.current.map(item => [item.key, item]));
    const flight = document.createElement("div");
    flight.className = "seat-mode-flight";
    flight.setAttribute("aria-hidden", "true");
    flight.inert = true;
    panel.append(flight);
    const animations: Animation[] = [];
    const options = { duration: DURATION, easing: EASING, fill: "both" as FillMode };
    // Read every destination before starting animations; no per-frame layout reads.
    const destinations = cells(target).map(cell => ({ ...cell, rect: cell.element.getBoundingClientRect() }));
    for (const { element, key, rect } of destinations) {
      const before = snapshots.get(key);
      if (!before || !before.rect.width || !before.rect.height || !rect.width || !rect.height) {
        animations.push(element.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], options));
        continue;
      }
      const dx = before.rect.left - rect.left;
      const dy = before.rect.top - rect.top;
      animations.push(element.animate([
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${before.rect.width / rect.width}, ${before.rect.height / rect.height})`, opacity: 1 },
        { transformOrigin: "top left", transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
      ], options));
      const wrapper = document.createElement("div");
      wrapper.className = "seat-mode-flight__cell";
      Object.assign(wrapper.style, {
        left: `${before.rect.left - origin.left - panel.clientLeft}px`, top: `${before.rect.top - origin.top - panel.clientTop}px`,
        width: `${before.rect.width}px`, height: `${before.rect.height}px`,
      });
      // Clones are presentation-only and must never duplicate interactive IDs.
      before.content.removeAttribute("id");
      before.content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      Object.assign(before.content.style, { position: "relative", left: "auto", top: "auto", transform: "none" });
      wrapper.append(before.content);
      flight.append(wrapper);
      animations.push(wrapper.animate([
        { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
        { opacity: 0, offset: 0.8 },
        { transform: `translate(${-dx}px, ${-dy}px) scale(${rect.width / before.rect.width}, ${rect.height / before.rect.height})`, opacity: 0 },
      ], options));
    }
    target.querySelectorAll<HTMLElement>(".seat-groups-overlay, .seat-grid-axis, [data-designer-status], .seat-waiting-dock, .seat-layout-editor-cell[data-active='false']:not([data-podium='true'])").forEach(element => {
      animations.push(element.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], options));
    });
    let disposed = false;
    const clean = () => {
      disposed = true;
      animations.forEach(animation => animation.cancel());
      flight.remove();
      delete panel.dataset.seatModeTransition;
    };
    cleanupRef.current = clean;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (disposed) return;
      clean();
      cleanupRef.current = null;
      busyRef.current = false;
      snapshotRef.current = [];
      setTransitioning(false);
      const focusTarget = editingLayout
        ? document.querySelector<HTMLElement>(".seat-mode-toolbar__editor button")
        : document.getElementById("seat-layout-editor-trigger");
      focusTarget?.focus({ preventScroll: true });
    });
    return clean;
  }, [editingLayout, transitioning]);

  useLayoutEffect(() => () => cleanupRef.current?.(), []);
  return { editingLayout, transitioning, seatPanelRef, switchLayoutEditing };
}
