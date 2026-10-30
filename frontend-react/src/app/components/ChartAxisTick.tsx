/** Single-line chart labels with known font sizes need no hidden DOM text
 * measurements. Keep numeric ticks cheap while the chart data is switching. */
export function ChartAxisTick({ x, y, payload, vertical = false, percentage = false, fontSize = 12 }: {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  vertical?: boolean;
  percentage?: boolean;
  fontSize?: number;
}) {
  return <text x={x} y={y} dy={vertical ? "0.355em" : "0.71em"} textAnchor={vertical ? "end" : "middle"} fontSize={fontSize} fill="var(--app-chart-axis)">{payload?.value}{percentage ? "%" : ""}</text>;
}
