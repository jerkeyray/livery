import {
  computeTimelineState,
  boardSceneToSvg,
  render as renderProgram,
  type BoardScene,
  type Diagnostic,
  type LiveryTheme,
  type TokenOverrides,
  type VisualDocument,
} from "@jerkeyray/core";

export type LiveryVisualOptions = {
  theme?: LiveryTheme;
  tokenOverrides?: TokenOverrides;
  width?: number;
  timeline?: string;
  state?: string;
  debug?: boolean;
};

export type LiveryVisualInstance = {
  readonly document?: VisualDocument;
  readonly diagnostics: Diagnostic[];
  readonly scene?: BoardScene;
  setState(stateId: string): void;
  destroy(): void;
};

export function mountLiveryVisual(container: HTMLElement, source: string, options: LiveryVisualOptions = {}): LiveryVisualInstance {
  const result = renderProgram(source, { ...options, width: options.width ?? (container.clientWidth || 720) });
  if (!result.document || !result.scene || !result.svg) {
    container.replaceChildren(errorElement(container.ownerDocument, result.diagnostics));
    return { diagnostics: result.diagnostics, setState() {}, destroy: () => container.replaceChildren() };
  }
  const document = result.document;
  const scene = result.scene;
  const timeline = document.timelines.find(({ id }) => id === options.timeline) ?? document.timelines[0];
  let currentStateId = options.state;
  const renderSvg = (stateId?: string) => {
    const state = timeline && stateId ? computeTimelineState(timeline, stateId, scene) : undefined;
    return boardSceneToSvg(scene, { ...(options.theme ? { theme: options.theme } : {}), ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}), ...(state ? { state } : {}), ...(options.debug ? { debug: true } : {}) });
  };
  const parseSvg = (svg: string) => {
    const Parser = container.ownerDocument.defaultView?.DOMParser ?? DOMParser;
    return container.ownerDocument.importNode(new Parser().parseFromString(svg, "image/svg+xml").documentElement, true) as unknown as SVGSVGElement;
  };
  const rendered = parseSvg(result.svg);
  container.replaceChildren(rendered);
  const setState = (stateId: string) => {
    const nextStateId = stateId || undefined;
    const next = parseSvg(renderSvg(nextStateId));
    const duration = transitionDuration(timeline, currentStateId, nextStateId, options.theme);
    const before = capturePresentation(rendered);
    syncElementTree(rendered, next);
    animatePresentation(rendered, before, duration);
    currentStateId = nextStateId;
  };
  return { document, diagnostics: result.diagnostics, scene, setState, destroy: () => container.replaceChildren() };
}

type Presentation = Map<string, { opacity: string; transform: string; traced: boolean }>;

function capturePresentation(svg: SVGSVGElement): Presentation {
  const values: Presentation = new Map();
  for (const element of svg.querySelectorAll<SVGElement>("[data-livery-id],[data-livery-connector],[data-livery-group]")) {
    const key = presentationKey(element);
    if (key) values.set(key, { opacity: element.getAttribute("opacity") ?? "1", transform: element.getAttribute("transform") ?? "none", traced: element.hasAttribute("data-livery-traced") });
  }
  return values;
}

function syncElementTree(current: Element, next: Element) {
  for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  for (const attribute of [...next.attributes]) current.setAttribute(attribute.name, attribute.value);
  const currentChildren = [...current.childNodes];
  const nextChildren = [...next.childNodes];
  for (let index = 0; index < Math.max(currentChildren.length, nextChildren.length); index += 1) {
    const oldChild = currentChildren[index];
    const newChild = nextChildren[index];
    if (!newChild && oldChild) oldChild.remove();
    else if (newChild && !oldChild) current.append(newChild.cloneNode(true));
    else if (oldChild && newChild && isElementNode(oldChild) && isElementNode(newChild) && oldChild.tagName === newChild.tagName) syncElementTree(oldChild, newChild);
    else if (oldChild && newChild && oldChild.nodeType === newChild.nodeType) oldChild.nodeValue = newChild.nodeValue;
    else if (oldChild && newChild) oldChild.replaceWith(newChild.cloneNode(true));
  }
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1;
}

function animatePresentation(svg: SVGSVGElement, before: Presentation, duration: number) {
  const view = svg.ownerDocument.defaultView;
  if (!duration || view?.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const element of svg.querySelectorAll<SVGElement>("[data-livery-id],[data-livery-connector],[data-livery-group]")) {
    const previous = before.get(presentationKey(element) ?? "");
    if (!previous || typeof element.animate !== "function") continue;
    const opacity = element.getAttribute("opacity") ?? "1";
    const transform = element.getAttribute("transform") ?? "none";
    if (previous.opacity !== opacity || previous.transform !== transform) element.animate(
      [{ opacity: previous.opacity, transform: previous.transform }, { opacity, transform }],
      { duration, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    if (!previous.traced && element.hasAttribute("data-livery-traced")) {
      const path = element.matches("path") ? element : element.querySelector<SVGPathElement>("path");
      const length = path?.getTotalLength?.();
      if (path && length) path.animate([{ strokeDasharray: `${length}`, strokeDashoffset: length }, { strokeDasharray: `${length}`, strokeDashoffset: 0 }], { duration, easing: "ease-out" });
    }
  }
}

function presentationKey(element: Element) {
  return element.getAttribute("data-livery-connector")
    ? `connector:${element.getAttribute("data-livery-connector")}`
    : element.getAttribute("data-livery-group")
      ? `group:${element.getAttribute("data-livery-group")}`
      : element.getAttribute("data-livery-id") ? `element:${element.getAttribute("data-livery-id")}` : undefined;
}

function transitionDuration(timeline: VisualDocument["timelines"][number] | undefined, from: string | undefined, to: string | undefined, theme: LiveryTheme | undefined) {
  if (!from || !to) return 0;
  const transition = timeline?.transitions.find((candidate) => candidate.from === from && candidate.to === to);
  const token = transition?.duration ?? "normal";
  const value = (theme?.tokens.motion ?? { fast: 120, normal: 220, slow: 400 })[token];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 220;
}

function errorElement(document: Document, diagnostics: Diagnostic[]) {
  const element = document.createElement("div");
  element.className = "livery-error";
  element.setAttribute("role", "alert");
  element.textContent = diagnostics.map(({ message }) => message).join(" ");
  return element;
}
