import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Commit measured size and chart data together, before paint. Keeping the chart
 * mounted preserves its previous points instead of replaying a zero-height entrance.
 * `height="fill"` lets a flex-parent card stretch the chart to its leftover space. */
export function ChartViewport({ height, minHeight = 200, minWidth = 0, children }: { height: number | "fill"; minHeight?: number; minWidth?: number; children: (width: number, height: number) => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number; render: typeof children } | null>(null);
  useLayoutEffect(() => {
    const node = root.current!;
    const measure = () => {
      const box = node.getBoundingClientRect();
      const width = Math.max(minWidth, Math.round(box.width));
      const measuredHeight = height === "fill" ? Math.round(box.height) : height;
      if (width > 0 && measuredHeight > 0) setFrame(previous => previous?.width === width && previous.height === measuredHeight && previous.render === children ? previous : { width, height: measuredHeight, render: children });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, height, minWidth]);
  const style = height === "fill" ? { flex: "1 1 0%", minHeight } : { height };
  return <div data-chart-viewport ref={root} className={minWidth ? "min-w-0 overflow-x-auto" : "min-w-0"} style={style}>{frame ? frame.render(frame.width, frame.height) : null}</div>;
}
