import { useEffect, useState } from "react";

const DURATION = 320;
// 与 theme.css 的 cubic-bezier(0.22, 1, 0.36, 1) 同感的单调减速。
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * 在 oklch 空间直接插值：饱和度沿最短路连续变化，柱子全程不透明，
 * 既没有 srgb 互补色的灰色中点，也没有先变暗再变亮的闪帧。
 */
function mix(from: string, to: string, progress: number): string {
  if (progress >= 1 || from === to) return to;
  return `color-mix(in oklch, ${to} ${Math.round(ease(progress) * 100)}%, ${from})`;
}

interface BlendFrame {
  from: string[];
  to: string[];
  progress: number;
  signature: string;
  structureKey: string;
}

/**
 * 图表每次更新都会重建 SVG 节点，CSS transition 接不住颜色变化，所以在数据层插值颜色。
 * 只在同一组柱形（`structureKey` 不变、数量相同）内换色时过渡；结构变化交给图表自身的几何插值，
 * 避免逐帧重渲染打断柱高动画。中途反向从当前可见颜色继续。
 */
export function useBlendedColors(colors: string[], structureKey: string, reducedMotion: boolean): string[] {
  const signature = colors.join("|");
  const [stored, setFrame] = useState<BlendFrame>({ from: colors, to: colors, progress: 1, signature, structureKey });
  let frame = stored;
  if (stored.signature !== signature || stored.structureKey !== structureKey) {
    const instant = reducedMotion || stored.structureKey !== structureKey || stored.to.length !== colors.length;
    const visible = stored.to.map((to, index) => mix(stored.from[index], to, stored.progress));
    frame = { from: instant ? colors : visible, to: colors, progress: instant ? 1 : 0, signature, structureKey };
    setFrame(frame);
  }
  const running = frame.progress < 1;
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // rAF 时间戳可能早于 useEffect 里的 start，负进度会让 color-mix 外推出界变黑。
      const progress = Math.min(1, Math.max(0, (now - start) / DURATION));
      setFrame(current => current.signature === signature ? { ...current, progress } : current);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, signature]);
  return frame.to.map((to, index) => mix(frame.from[index], to, frame.progress));
}
