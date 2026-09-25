import { Children, Component, createRef, isValidElement, type ReactNode, useLayoutEffect, useRef, useState } from "react";

const DURATION = 320;
export const DIALOG_EXIT_DURATION = 240;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canAnimate = (node: HTMLElement) => !reduced() && typeof node.animate === "function" && node.getBoundingClientRect().width > 0;

let snapshotSequence = 0;

// Visual snapshots never mount React a second time or keep old business handlers alive.
function snapshot(node: HTMLElement): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  const originals = [node, ...node.querySelectorAll<HTMLElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  // SVG clips/gradients must remain local to the inert copy, with no duplicate live IDs.
  const prefix = `motion-snapshot-${++snapshotSequence}`;
  const svgIds = new Map(originals.filter(source => source instanceof SVGElement && source.id).map((source, index) => [source.id, `${prefix}-${index}`]));
  const animated = new Set(node.getAnimations({ subtree: true }).map(animation => (animation.effect as KeyframeEffect | null)?.target));
  originals.forEach((source, index) => {
    const target = copies[index];
    if (target.id) target.removeAttribute("id");
    if (source instanceof SVGElement && svgIds.has(source.id)) target.id = svgIds.get(source.id)!;
    for (const attribute of svgIds.size ? Array.from(target.attributes) : []) {
      const value = attribute.value.replace(/url\(["']?#([^"')]+)["']?\)/g, (match, id: string) => svgIds.has(id) ? `url(#${svgIds.get(id)})` : match);
      const next = (attribute.name === "href" || attribute.name === "xlink:href") && svgIds.has(value.slice(1)) ? `#${svgIds.get(value.slice(1))}` : value;
      if (next !== attribute.value) target.setAttribute(attribute.name, next);
    }
    target.removeAttribute("autofocus");
    target.removeAttribute("name");
    if (source.scrollTop || source.scrollLeft) {
      target.dataset.snapshotScroll = `${source.scrollTop},${source.scrollLeft}`;
    }
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.value = source.value;
      target.checked = source.checked;
    }
    if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) target.value = source.value;
    if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) target.selectedIndex = source.selectedIndex;
    // Capture an interrupted animation at its currently visible position.
    if (animated.has(source)) {
      const style = getComputedStyle(source);
      for (const property of ["transform", "opacity", "width", "height", "left", "top", "border-radius", "background-color", "box-shadow"]) {
        target.style.setProperty(property, style.getPropertyValue(property));
      }
    }
  });
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("app-motion-snapshot");
  return copy;
}

type SwitchProps = {
  children: ReactNode;
  transitionKey: string | number;
  className?: string;
  contentClassName?: string;
  direction?: "left" | "right";
  /** Ordered sidebar navigation: a short visual lead, then a vertical page handoff. */
  navigationIndex?: number;
  /** Ordered records: move only data-motion-shift regions inside a stationary shell. */
  contentIndex?: number;
  fixed?: boolean;
  sharedLayout?: boolean;
  preserveContent?: boolean;
  /** The switch itself owns a bounded scroll viewport, so height follows visible content. */
  scrollable?: boolean;
};
type SurfaceSnapshot = { key: string; rect: DOMRect; image: HTMLElement; radius: string; background: string; border: string };
type SwitchSnapshot = { image: HTMLElement; height: number; surfaces: SurfaceSnapshot[]; interrupted: boolean } | null;
function surfaces(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-motion-surface]")).filter(node => !node.closest(".app-motion-overlay"));
}


/** Continuous replacement: old pixels remain until the new content is in place. */
export class MotionSwitch extends Component<SwitchProps> {
  private root = { current: null as HTMLDivElement | null };
  private content = createRef<HTMLDivElement>();
  private overlay = createRef<HTMLDivElement>();
  private animations: Animation[] = [];
  private observers: MutationObserver[] = [];
  private navigationWait: MutationObserver | null = null;
  private cleanup = () => {
    this.navigationWait?.disconnect();
    this.navigationWait = null;
    if (this.content.current) {
      this.content.current.inert = false;
      this.content.current.removeAttribute("aria-hidden");
    }
    this.root.current?.removeAttribute("data-navigation-phase");
    this.root.current?.removeAttribute("aria-busy");
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.overlay.current?.replaceChildren();
    this.root.current?.removeAttribute("data-moving");
  };

  getSnapshotBeforeUpdate(previous: SwitchProps): SwitchSnapshot {
    const root = this.root.current;
    if (previous.transitionKey === this.props.transitionKey || !root) return null;
    if (!canAnimate(root)) { this.cleanup(); return null; }
    const interrupted = root.hasAttribute("data-moving");
    // Include the fading snapshot on rapid reversal, then release the previous flight.
    const image = snapshot(root);
    const origin = root.getBoundingClientRect();
    // A reversal keeps the current composite frame; it never resets to either endpoint.
    const painted = new Map(Array.from(this.overlay.current?.querySelectorAll<HTMLElement>(":scope > [data-motion-surface-frame]") || []).map(node => [node.dataset.motionSurfaceFrame, node]));
    const shared = this.props.sharedLayout ? surfaces(root).map(node => {
      const current = painted.get(node.dataset.motionSurface!) || node;
      const rect = current.getBoundingClientRect(), style = getComputedStyle(current);
      return { key: node.dataset.motionSurface!, rect: new DOMRect(rect.x - origin.x, rect.y - origin.y, rect.width, rect.height), image: snapshot(current), radius: style.borderRadius, background: style.backgroundColor, border: style.borderColor };
    }) : [];
    this.cleanup();
    return { image, height: origin.height, surfaces: shared, interrupted };
  }

  componentDidUpdate(_previous: SwitchProps, _state: unknown, before: SwitchSnapshot) {
    const root = this.root.current!;
    if (this.props.scrollable && _previous.transitionKey !== this.props.transitionKey) root.scrollTop = 0;
    if (!before) return;
    const content = this.content.current!;
    const overlay = this.overlay.current!;
    const nextHeight = root.getBoundingClientRect().height;
    Object.assign(before.image.style, { position: "absolute", inset: "0 auto auto 0", width: "100%", height: `${before.height}px`, margin: "0" });
    // The outer viewport already reserves its gutter; the visual copy must not add a second one.
    if (this.props.scrollable) Object.assign(before.image.style, { overflow: "hidden", scrollbarGutter: "auto" });
    overlay.replaceChildren(before.image);
    [before.image, ...before.image.querySelectorAll<HTMLElement>("[data-snapshot-scroll]")].filter(node => node.dataset.snapshotScroll).forEach(node => {
      const [top, left] = node.dataset.snapshotScroll!.split(",").map(Number);
      node.scrollTop = top; node.scrollLeft = left;
    });
    root.dataset.moving = "true";
    if (this.props.navigationIndex !== undefined) {
      this.animateNavigation(_previous, before);
      return;
    }
    // Measure destination rects before the slide/opacity flights begin — once
    // content has a transform, getBoundingClientRect returns the animated
    // position and the surface frame would land a slide-distance away.
    const surfaceTargets = before.surfaces.length
      ? new Map(surfaces(content).map(node => [node.dataset.motionSurface!, { node, rect: node.getBoundingClientRect() }]))
      : null;
    const distance = this.props.direction ? (this.props.direction === "left" ? -12 : 12) : 0;
    const orderedContent = this.props.contentIndex !== undefined;
    const options: KeyframeAnimationOptions = { duration: orderedContent ? 400 : DURATION, easing: orderedContent ? "cubic-bezier(0.3, 0, 0.2, 1)" : EASING, fill: "both" };
    // Keep the destination opaque: fading both layers exposes the background mid-flight.
    if (orderedContent) {
      const offset = this.props.contentIndex! >= (_previous.contentIndex ?? 0) ? 24 : -24;
      // Frames and input borders stay still; only the changing record moves through them.
      const regions = (node: HTMLElement) => Array.from(node.querySelectorAll<HTMLElement>("[data-motion-shift]")).filter(region => !region.closest(".app-motion-overlay"));
      this.animations = [before.image.animate([{ opacity: 1 }, { opacity: 0 }], options)];
      regions(content).forEach(region => this.animations.push(region.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], options)));
      // An interrupted snapshot already contains the visible composite; fade it as-is.
      if (!before.interrupted) {
        Array.from(before.image.querySelectorAll<HTMLElement>("[data-motion-shift]")).forEach(region => this.animations.push(region.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-offset}px)` }], options)));
      }
    } else {
      this.animations = [
        content.animate([{ transform: `translateX(${distance}px)` }, { transform: "translateX(0)" }], options),
        before.image.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: `translateX(${-distance}px)` }], options),
      ];
    }
    if (surfaceTargets?.size) {
      const origin = root.getBoundingClientRect();
      before.surfaces.forEach(old => {
        const target = surfaceTargets.get(old.key);
        if (!target) return;
        const node = target.node;
        const rect = target.rect, style = getComputedStyle(node);
        const wasVisible = old.rect.bottom + origin.top > 0 && old.rect.top + origin.top < window.innerHeight;
        if (!wasVisible && (rect.bottom <= 0 || rect.top >= window.innerHeight)) return;
        const frame = document.createElement("div");
        frame.className = "app-motion-surface";
        frame.dataset.motionSurfaceFrame = old.key;
        // The shell changes size. Text keeps its real proportions in two clipped layers.
        Object.assign(frame.style, { position: "absolute", overflow: "hidden", left: `${rect.x - origin.x}px`, top: `${rect.y - origin.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: style.borderRadius, background: style.backgroundColor, boxShadow: `inset 0 0 0 1px ${style.borderColor}` });
        const arriving = snapshot(node);
        [old.image, arriving].forEach((layer, index) => {
          Object.assign(layer.style, { position: "absolute", left: "0", top: "0", margin: "0", width: `${index ? rect.width : old.rect.width}px`, height: `${index ? rect.height : old.rect.height}px`, borderColor: "transparent", borderRadius: "0", boxShadow: "none", background: "transparent", transform: "none" });
        });
        frame.append(arriving, old.image);
        // Responsive charts finish measuring after commit. Keep their arriving pixels
        // current during the same flight instead of revealing an empty/stale chart at its end.
        const observer = new MutationObserver(() => {
          const current = snapshot(node);
          arriving.replaceChildren(...Array.from(current.childNodes));
        });
        observer.observe(node, { childList: true, subtree: true, attributes: true, characterData: true });
        this.observers.push(observer);
        overlay.append(frame);
        before.image.querySelectorAll<HTMLElement>("[data-motion-surface], [data-motion-surface-frame]").forEach(copy => { if ((copy.dataset.motionSurfaceFrame || copy.dataset.motionSurface) === old.key) copy.style.visibility = "hidden"; });
        // Position rides on transform (compositor) instead of left/top (layout),
        // so the frame glides without per-frame pixel snapping; width/height still
        // animate to morph the shell's size.
        const dx = old.rect.x - (rect.x - origin.x);
        const dy = old.rect.y - (rect.y - origin.y);
        this.animations.push(
          node.animate([{ opacity: 0 }, { opacity: 0 }], options),
          frame.animate([
            { transform: `translate(${dx}px, ${dy}px)`, width: `${old.rect.width}px`, height: `${old.rect.height}px`, borderRadius: old.radius, background: old.background, boxShadow: `inset 0 0 0 1px ${old.border}` },
            { transform: "translate(0px, 0px)", width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: style.borderRadius, background: style.backgroundColor, boxShadow: `inset 0 0 0 1px ${style.borderColor}` },
          ], options),
          old.image.animate([{ opacity: 1 }, { opacity: 0 }], options),
          arriving.animate([{ opacity: 0 }, { opacity: 1 }], options),
        );
      });
    }
    if (!this.props.fixed && Math.abs(nextHeight - before.height) > 1) {
      this.animations.push(root.animate([{ height: `${before.height}px` }, { height: `${nextHeight}px` }], options));
    }
    const animations = this.animations;
    void Promise.all(animations.map(animation => animation.finished)).then(() => {
      if (this.animations === animations) this.cleanup();
    }).catch(() => { /* Replacement or unmount cancels this flight. */ });
  }

  private animateNavigation(previous: SwitchProps, before: NonNullable<SwitchSnapshot>) {
    const root = this.root.current!;
    const content = this.content.current!;
    const started = performance.now();
    const distance = this.props.navigationIndex! >= (previous.navigationIndex ?? 0) ? 40 : -40;
    root.dataset.navigationPhase = "preparing";
    root.setAttribute("aria-busy", "true");
    // Only the selected destination is mounted. Its controls cannot be used through old pixels.
    content.inert = true;
    content.setAttribute("aria-hidden", "true");
    const start = () => {
      if (content.querySelector("[data-motion-pending]")) return;
      this.navigationWait?.disconnect();
      this.navigationWait = null;
      root.dataset.navigationPhase = "moving";
      root.removeAttribute("aria-busy");
      if (!canAnimate(root)) { this.cleanup(); return; }
      const options: KeyframeAnimationOptions = { duration: 400, delay: before.interrupted ? 0 : Math.max(0, 90 - (performance.now() - started)), easing: EASING, fill: "both" };
      this.animations = [
        content.animate([{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }], options),
        before.image.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${-distance}px)` }], options),
      ];
      const animations = this.animations;
      void Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (this.animations === animations) this.cleanup();
      }).catch(() => { /* A newer navigation owns the current composite frame. */ });
    };
    this.navigationWait = new MutationObserver(start);
    this.navigationWait.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-motion-pending"] });
    start();
  }

  componentWillUnmount() { this.cleanup(); }
  render() {
    return <div ref={this.root} data-navigation-key={this.props.navigationIndex !== undefined ? this.props.transitionKey : undefined} className={`app-motion-switch ${this.props.navigationIndex !== undefined ? "app-motion-switch--navigation" : ""} ${this.props.scrollable ? "app-motion-switch--scrollable" : ""} ${this.props.fixed ? "app-motion-switch--fixed" : ""} ${this.props.className || ""}`}>
      <div key={this.props.preserveContent ? undefined : this.props.transitionKey} ref={this.content} className={`app-motion-content ${this.props.contentClassName || ""}`}>{this.props.children}</div>
      <div ref={this.overlay} className="app-motion-overlay" aria-hidden="true" />
    </div>;
  }
}

/** Keep the last content for collapse; closed controls leave keyboard and accessibility navigation. */
export function MotionCollapse({ open, children, className = "", contentClassName = "", animateOnMount = false }: { open: boolean; animateOnMount?: boolean; children: ReactNode; className?: string; contentClassName?: string }) {
  const lastContent = useRef(children);
  if (open) lastContent.current = children;
  const [present, setPresent] = useState(open);
  const [expanded, setExpanded] = useState(open && !animateOnMount);
  useLayoutEffect(() => {
    if (!open) {
      setExpanded(false);
      const timer = window.setTimeout(() => setPresent(false), reduced() ? 0 : DURATION);
      return () => window.clearTimeout(timer);
    }
    setPresent(true);
    if (reduced()) { setExpanded(true); return; }
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => setExpanded(true)); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [open]);
  return <div className={`app-motion-collapse ${className}`} data-open={open && expanded} aria-hidden={!open} {...{ inert: (!open ? "" : undefined) as unknown as boolean }}>
    <div className="app-motion-collapse__clip"><div className={`app-motion-collapse__content ${contentClassName}`}>{present ? (open ? children : lastContent.current) : null}</div></div>
  </div>;
}

type ListProps = { children: ReactNode; className?: string; };
type ListSnapshot = { positions: Map<string, { rect: DOMRect; opacity: string }>; removed: Array<{ image: HTMLElement; rect: DOMRect }>; height: number } | null;
function childKeys(children: ReactNode) { return Children.toArray(children).map(child => isValidElement(child) ? child.key : "").join("|"); }

/** Reflow stable keyed rows in place; data ordering and updates stay synchronous. */
export class MotionList extends Component<ListProps> {
  private root = { current: null as HTMLDivElement | null };
  private animations: Animation[] = [];
  private ghosts: HTMLElement[] = [];
  private cleanup = () => { this.animations.forEach(animation => animation.cancel()); this.animations = []; this.ghosts.forEach(node => node.remove()); this.ghosts = []; };
  getSnapshotBeforeUpdate(previous: ListProps): ListSnapshot {
    const root = this.root.current;
    if (!root || childKeys(previous.children) === childKeys(this.props.children) || !canAnimate(root)) return null;
    const origin = root.getBoundingClientRect();
    const positions = new Map<string, { rect: DOMRect; opacity: string }>();
    const nextKeys = new Set(Children.toArray(this.props.children).map(child => isValidElement(child) ? String(child.key) : ""));
    // Keep already departing rows at their current opacity across rapid filtering.
    const removed = this.ghosts.map(node => {
      const rect = node.getBoundingClientRect();
      return { image: snapshot(node), rect: new DOMRect(rect.x - origin.x, rect.y - origin.y, rect.width, rect.height) };
    });
    Array.from(root.children).filter(node => !this.ghosts.includes(node as HTMLElement)).forEach(node => {
      if (node instanceof HTMLElement) {
        const rect = node.getBoundingClientRect();
        const relative = new DOMRect(rect.x - origin.x, rect.y - origin.y, rect.width, rect.height);
        positions.set(node.dataset.motionKey!, { rect: relative, opacity: getComputedStyle(node).opacity });
        if (!nextKeys.has(node.dataset.motionKey!)) removed.push({ image: snapshot(node), rect: relative });
      }
    });
    const height = origin.height;
    this.cleanup();
    return { positions, removed, height };
  }
  componentDidMount() { this.assignKeys(); }
  private assignKeys() {
    const keys = Children.toArray(this.props.children).map(child => isValidElement(child) ? String(child.key) : "");
    Array.from(this.root.current?.children || []).filter(node => !this.ghosts.includes(node as HTMLElement)).forEach((node, index) => { if (node instanceof HTMLElement) node.dataset.motionKey = keys[index]; });
  }
  componentDidUpdate(_previous: ListProps, _state: unknown, before: ListSnapshot) {
    this.assignKeys();
    if (!before) return;
    const root = this.root.current!;
    const origin = root.getBoundingClientRect();
    const options: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: "both" };
    Array.from(root.children).forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      const old = before.positions.get(node.dataset.motionKey!);
      const rect = node.getBoundingClientRect();
      if (old) {
        const dx = old.rect.x - (rect.x - origin.x), dy = old.rect.y - (rect.y - origin.y);
        if (Math.abs(dx) + Math.abs(dy) > 1 || Number(old.opacity) < 1) this.animations.push(node.animate([{ opacity: old.opacity, transform: `translate(${dx}px, ${dy}px)` }, { opacity: 1, transform: "translate(0, 0)" }], options));
      } else this.animations.push(node.animate([{ opacity: 0 }, { opacity: 1 }], options));
    });
    before.removed.forEach(({ image, rect }) => {
      Object.assign(image.style, { position: "absolute", top: `${rect.y}px`, left: `${rect.x}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", zIndex: "1" });
      root.append(image);
      this.ghosts.push(image);
      this.animations.push(image.animate([{ opacity: image.style.opacity || 1 }, { opacity: 0 }], options));
    });
    if (Math.abs(origin.height - before.height) > 1) this.animations.push(root.animate([{ height: `${before.height}px` }, { height: `${origin.height}px` }], options));
    const animations = this.animations;
    void Promise.all(animations.map(animation => animation.finished)).then(() => { if (this.animations === animations) this.cleanup(); }).catch(() => {});
  }
  componentWillUnmount() { this.cleanup(); }
  render() { return <div ref={this.root} className={`app-motion-list ${this.props.className || ""}`}>{this.props.children}</div>; }
}

type PresenceProps = { active: boolean; children: ReactNode; className?: string };
type PresenceSnapshot = Array<{ node: HTMLElement; pseudoElement?: string; opacity: string; transform: string; filter: string }> | null;

/** Sample the live frame before reversing an overlay, including during its initial CSS entrance. */
export class PresenceMotion extends Component<PresenceProps> {
  private root = { current: null as HTMLDivElement | null };
  private animations: Animation[] = [];
  getSnapshotBeforeUpdate(previous: PresenceProps): PresenceSnapshot {
    if (previous.active === this.props.active || !this.root.current) return null;
    const states = Array.from(this.root.current.querySelectorAll<HTMLElement>(".modal-panel-enter, .soft-backdrop-enter, .tool-drawer-enter, .ai-companion-panel"))
      .filter(node => node.closest(".app-presence-motion") === this.root.current)
      .map(node => {
        const pseudoElement = node.classList.contains("app-modal-overlay") && typeof node.animate === "function" ? "::before" : undefined;
        const style = getComputedStyle(node, pseudoElement);
        return { node, pseudoElement, opacity: style.opacity, transform: style.transform, filter: style.filter };
      });
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    return states;
  }
  componentDidUpdate(_previous: PresenceProps, _state: unknown, before: PresenceSnapshot) {
    if (!before) return;
    const active = this.props.active;
    before.forEach(({ node, pseudoElement, ...from }) => {
      node.style.animation = "none";
      const transform = active ? "none" : node.classList.contains("tool-drawer-enter") ? "translateX(16px)" : (node.classList.contains("modal-panel-enter") || node.classList.contains("ai-companion-panel")) ? "translateY(6px)" : "none";
      if (reduced() || typeof node.animate !== "function") return;
      const isModal = node.classList.contains("app-modal-overlay") || node.classList.contains("modal-panel-enter");
      const animation = node.animate([from, { opacity: active ? 1 : 0, transform, filter: "none" }], { duration: isModal ? (active ? DURATION : DIALOG_EXIT_DURATION) : (active ? 240 : 200), easing: EASING, fill: "both", pseudoElement });
      this.animations.push(animation);
      if (active) void animation.finished.then(() => animation.cancel()).catch(() => {});
    });
  }
  componentWillUnmount() { this.animations.forEach(animation => animation.cancel()); }
  render() { return <div ref={node => { this.root.current = node; if (node) node.inert = !this.props.active; }} data-phase={this.props.active ? "open" : "closing"} aria-hidden={!this.props.active || undefined} {...{ inert: (!this.props.active ? "" : undefined) as unknown as boolean }} className={`app-presence-motion ${this.props.className || "contents"}`}>{this.props.children}</div>; }
}
