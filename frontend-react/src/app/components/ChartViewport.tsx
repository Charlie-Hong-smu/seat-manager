import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Commit measured size and chart data together, before paint. Keeping the chart
 * mounted preserves its previous points instead of replaying a zero-height entrance.
 * `height="fill"` lets a flex-parent card stretch the chart to its leftover space. */
export function ChartViewport({ height, minHeight = 200, minWidth = 0, children }: { height: number | "fill"; minHeight?: number; minWidth?: number; children: (width: number, height: number) => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const committedRender = useRef(children);
  const [frame, setFrame] = useState<{ width: number; height: number; mode: typeof height; minWidth: number } | null>(null);
  const layoutReady = frame?.mode === height && frame.minWidth === minWidth;
  useLayoutEffect(() => {
    if (layoutReady) committedRender.current = children;
  }, [children, layoutReady]);
  useLayoutEffect(() => {
    const node = root.current!;
    const measure = (box: Pick<DOMRectReadOnly, "width" | "height">) => {
      const width = Math.max(minWidth, Math.round(box.width));
      const measuredHeight = height === "fill" ? Math.round(box.height) : height;
      if (width > 0 && measuredHeight > 0) setFrame(previous => previous?.width === width && previous.height === measuredHeight && previous.mode === height && previous.minWidth === minWidth ? previous : { width, height: measuredHeight, mode: height, minWidth });
    };
    measure(node.getBoundingClientRect());
    const observer = new ResizeObserver(entries => {
      const entry = entries.find(item => item.target === node);
      if (entry) measure(entry.contentRect);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, minWidth]);
  const style = height === "fill" ? { flex: "1 1 0%", minHeight } : { height };
  // Same layout: render the new data in this commit. A structural change keeps
  // the previous chart until its new size is measured in the layout effect.
  return <div data-chart-viewport ref={root} className={minWidth ? "min-w-0 overflow-x-auto" : "min-w-0"} style={style}>{frame ? (layoutReady ? children : committedRender.current)(frame.width, frame.height) : null}</div>;
}
