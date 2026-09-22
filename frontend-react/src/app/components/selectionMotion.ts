import { flushSync } from "react-dom";

interface SelectionTransferOptions {
  itemId: string;
  sourceElement: HTMLElement;
  sourceContainer: HTMLElement | null;
  targetContainer: HTMLElement | null;
  commit: () => void;
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

function isEffectivelyVisible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility !== "visible" || Number.parseFloat(style.opacity) < 0.95) return false;
  }
  return true;
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

/**
 * 在两个选择容器之间移动一项：commit 后先把新出现的目标元素滚入视口（瞬时，
 * 让位 FLIP 的位移会自然带上这次滚动），其余项做让位/合拢 FLIP；目标元素
 * 本体隐身，由"目标元素的克隆"挂在 body 层飞行——不被滚动容器裁剪、不受
 * 弹层层叠顺序遮挡，始终可见。克隆起飞时先压回源元素的形状（矩形行↔小
 * 矩形 chip 之间连续形变），飞行途中恢复成目标原形——落地帧与真实元素
 * 像素级一致，交接不可见，不存在"替身消失再生成"的闪烁。commit 仍是页面
 * 原本的数据更新。
 */
export function animateSelectionTransfer({
  itemId,
  sourceElement,
  sourceContainer,
  targetContainer,
  commit,
}: SelectionTransferOptions) {
  if (!targetContainer || !targetContainer.isConnected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  const sourceRect = sourceElement.getBoundingClientRect();
  const sourceBefore = snapshotItems(sourceContainer);
  const targetBefore = snapshotItems(targetContainer);
  flushSync(commit);

  // 目标必须真实可见才放克隆飞行：弹层关闭后其子树仍挂载（visibility/opacity
  // 隐藏），矩形有值但不可见——朝它飞就是"飞出到空气里"。祖先链逐层查
  // display/visibility/opacity，把"正在淡出"（opacity 过渡中途）也判为不可见。
  const destination = findMotionItem(targetContainer, itemId);
  const destinationVisible = Boolean(destination?.isConnected && isEffectivelyVisible(destination));
  if (destination && destinationVisible) destination.scrollIntoView({ block: "nearest" });
  animateReflow(sourceContainer, sourceBefore, itemId);
  animateReflow(targetContainer, targetBefore, itemId);
  if (!destination || !destinationVisible) {
    if (sourceRect.width < 1) return;
    // 无可见落点（如弹层已关闭）：源元素原地淡出收缩，避免生硬消失。
    const ghost = sourceElement.cloneNode(true) as HTMLElement;
    ghost.setAttribute("aria-hidden", "true");
    ghost.removeAttribute("data-selection-motion-id");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      margin: "0",
      zIndex: "140",
      pointerEvents: "none",
      transformOrigin: "center",
    });
    document.body.appendChild(ghost);
    const fade = ghost.animate([
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.98)" },
    ], { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    fade.finished.catch(() => undefined).finally(() => ghost.remove());
    return;
  }

  const targetRect = destination.getBoundingClientRect();
  const dx = sourceRect.left + sourceRect.width / 2 - (targetRect.left + targetRect.width / 2);
  const dy = sourceRect.top + sourceRect.height / 2 - (targetRect.top + targetRect.height / 2);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

  const duration = Math.min(560, Math.max(320, 300 + Math.hypot(dx, dy) * 0.45));
  destination.style.animation = "none";
  destination.style.opacity = "0";

  const clone = destination.cloneNode(true) as HTMLElement;
  clone.setAttribute("aria-hidden", "true");
  clone.removeAttribute("data-selection-motion-id");
  clone.style.animation = "none";
  Object.assign(clone.style, {
    position: "fixed",
    left: `${targetRect.left}px`,
    top: `${targetRect.top}px`,
    width: `${targetRect.width}px`,
    height: `${targetRect.height}px`,
    margin: "0",
    zIndex: "140",
    pointerEvents: "none",
    transformOrigin: "center",
  });
  document.body.appendChild(clone);
  // 起飞帧把克隆缩放回源元素的宽高比：长方形行压扁成 chip、chip 拉宽
  // 成行的近似形状；形变幅度钳制在不会把文字拉得失真的范围内。
  const sx = Math.max(0.3, Math.min(2.2, sourceRect.width / Math.max(targetRect.width, 1)));
  const sy = Math.max(0.3, Math.min(1.6, sourceRect.height / Math.max(targetRect.height, 1)));
  const flight = clone.animate([
    { offset: 0, opacity: 0.9, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})` },
    { offset: 0.2, opacity: 1 },
    { offset: 1, opacity: 1, transform: "translate3d(0, 0, 0) scale(1, 1)" },
  ], { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  flight.finished.catch(() => undefined).finally(() => {
    clone.remove();
    destination.style.opacity = "";
    destination.style.animation = "";
  });
}
