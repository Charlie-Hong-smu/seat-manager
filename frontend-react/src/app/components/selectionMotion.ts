import { flushSync } from "react-dom";

type MotionTone = "blue" | "indigo";

interface SelectionTransferOptions {
  itemId: string;
  itemName: string;
  sourceElement: HTMLElement;
  sourceContainer: HTMLElement | null;
  targetContainer: HTMLElement | null;
  commit: () => void;
  tone?: MotionTone;
}

interface MotionSnapshot {
  id: string;
  rect: DOMRect;
}

function motionItems(container: HTMLElement | null): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>("[data-selection-motion-id]")) : [];
}

function snapshotItems(container: HTMLElement | null): MotionSnapshot[] {
  return motionItems(container).map(element => ({
    id: element.dataset.selectionMotionId || "",
    rect: element.getBoundingClientRect(),
  })).filter(item => item.id);
}

function findMotionItem(container: HTMLElement | null, itemId: string): HTMLElement | null {
  return motionItems(container).find(element => element.dataset.selectionMotionId === itemId) || null;
}

function animateReflow(container: HTMLElement | null, before: MotionSnapshot[], excludedId: string) {
  if (!container) return;
  const beforeById = new Map(before.map(item => [item.id, item.rect]));
  motionItems(container).forEach(element => {
    const id = element.dataset.selectionMotionId || "";
    if (!id || id === excludedId) return;
    const previous = beforeById.get(id);
    if (!previous) return;
    const current = element.getBoundingClientRect();
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    element.animate([
      { transform: `translate3d(${dx}px, ${dy}px, 0)` },
      { transform: "translate3d(0, 0, 0)" },
    ], { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  });
}

function createFlyingName(name: string, start: DOMRect, end: DOMRect, tone: MotionTone) {
  const label = document.createElement("div");
  const palette = tone === "indigo"
    ? { border: "rgba(129, 140, 248, .45)", background: "rgba(238, 242, 255, .98)", color: "#4338ca" }
    : { border: "rgba(96, 165, 250, .45)", background: "rgba(239, 246, 255, .98)", color: "#1d4ed8" };
  const startX = start.left + Math.min(14, start.width * 0.15);
  const startY = start.top + start.height / 2 - 13;
  const endX = end.left + Math.min(14, end.width * 0.15);
  const endY = end.top + end.height / 2 - 13;
  const dx = endX - startX;
  const dy = endY - startY;
  Object.assign(label.style, {
    position: "fixed",
    zIndex: "140",
    left: `${startX}px`,
    top: `${startY}px`,
    height: "26px",
    maxWidth: "132px",
    padding: "4px 10px",
    borderRadius: "999px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    boxShadow: "0 14px 32px rgba(37, 99, 235, .22)",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "16px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    willChange: "transform, opacity",
  });
  label.textContent = name;
  document.body.appendChild(label);
  const arc = Math.min(38, Math.max(16, Math.abs(dy) * 0.1));
  const direction = dy <= 0 ? -1 : 1;
  const animation = label.animate([
    { offset: 0, opacity: 0.2, transform: "translate3d(0, 4px, 0) scale(.9)" },
    { offset: 0.16, opacity: 1, transform: `translate3d(${dx * 0.08}px, ${dy * 0.08 + arc * direction}px, 0) scale(1.06)` },
    { offset: 0.76, opacity: 1, transform: `translate3d(${dx * 0.8}px, ${dy * 0.8 + arc * direction * 0.3}px, 0) scale(.98)` },
    { offset: 1, opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0) scale(.9)` },
  ], { duration: 760, easing: "cubic-bezier(.22,.72,.2,1)" });
  animation.finished.catch(() => undefined).finally(() => label.remove());
}

/**
 * 在两个选择容器之间移动一个姓名：新项精确飞到最终 DOM 位置，
 * 其他项通过 FLIP 动画让位或合拢。commit 仍是页面原本的数据更新。
 */
export function animateSelectionTransfer({
  itemId,
  itemName,
  sourceElement,
  sourceContainer,
  targetContainer,
  commit,
  tone = "blue",
}: SelectionTransferOptions) {
  if (!targetContainer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  const sourceRect = sourceElement.getBoundingClientRect();
  const sourceBefore = snapshotItems(sourceContainer);
  const targetBefore = snapshotItems(targetContainer);
  flushSync(commit);

  const destination = findMotionItem(targetContainer, itemId);
  const targetRect = destination?.getBoundingClientRect() || targetContainer.getBoundingClientRect();
  animateReflow(sourceContainer, sourceBefore, itemId);
  animateReflow(targetContainer, targetBefore, itemId);

  if (destination) {
    destination.animate([
      { offset: 0, opacity: 0 },
      { offset: 0.78, opacity: 0 },
      { offset: 1, opacity: 1 },
    ], { duration: 760, easing: "ease-out" });
  }
  createFlyingName(itemName, sourceRect, targetRect, tone);
}
