import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Commit measured size and chart data together, before paint. Keeping the chart
 * mounted preserves its previous points instead of replaying a zero-height entrance. */
export function ChartViewport({ height, children }: { height: number; children: (width: number, height: number) => ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number; render: typeof children } | null>(null);
  useLayoutEffect(() => {
    const node = root.current!;
    const measure = () => {
      const width = Math.round(node.getBoundingClientRect().width);
      if (width > 0) setFrame(previous => previous?.width === width && previous.height === height && previous.render === children ? previous : { width, height, render: children });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, height]);
  return <div ref={root} className="min-w-0" style={{ height }}>{frame ? frame.render(frame.width, frame.height) : null}</div>;
}
