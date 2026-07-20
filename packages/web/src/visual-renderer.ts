import {
  computeTimelineState,
  boardSceneToSvg,
  canonicalTheme,
  render as renderProgram,
  type BoardScene,
  type Diagnostic,
  type LiveryTheme,
  type IconRegistry,
  type ResourcePolicy,
  type TokenOverrides,
  type VisualDocument,
} from "@liveryscript/core";

export type LiveryVisualOptions = {
  theme?: LiveryTheme;
  tokenOverrides?: TokenOverrides;
  icons?: IconRegistry;
  resourcePolicy?: ResourcePolicy;
  width?: number;
  timeline?: string;
  state?: string;
  debug?: boolean;
  retainLastValid?: boolean;
  responsive?: boolean;
  onRevision?: (revision: LiveryVisualRevision) => void;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
};

export type LiveryVisualStatus = "empty" | "ready" | "retained" | "invalid";

export type LiveryVisualRevision = {
  status: LiveryVisualStatus;
  source: string;
  diagnostics: Diagnostic[];
  document?: VisualDocument;
  scene?: BoardScene;
};

export interface LiveryVisualInstance {
  readonly revision: LiveryVisualRevision;
  /** @deprecated Read revision.document. */
  readonly document: VisualDocument | undefined;
  /** @deprecated Read revision.diagnostics. */
  readonly diagnostics: Diagnostic[];
  /** @deprecated Read revision.scene. */
  readonly scene: BoardScene | undefined;
  update(source: string): LiveryVisualRevision;
  setTheme(theme?: LiveryTheme): void;
  setState(stateId: string): void;
  destroy(): void;
}

export function mountLiveryVisual(container: HTMLElement, source: string, options: LiveryVisualOptions = {}): LiveryVisualInstance {
  let currentSource = source;
  let currentWidth = normalizedWidth(options.width ?? (container.clientWidth || 720));
  let currentStateId = options.state;
  let currentTheme = options.theme ?? canonicalTheme;
  let rendered: SVGSVGElement | undefined;
  let identity: string | undefined;
  let revision: LiveryVisualRevision = { status: "empty", source, diagnostics: [] };
  let destroyed = false;
  const revisionCache = new Map<string, { revision: LiveryVisualRevision; svg: string; identity: string }>();

  const parseSvg = (svg: string) => {
    const Parser = container.ownerDocument.defaultView?.DOMParser ?? DOMParser;
    return container.ownerDocument.importNode(new Parser().parseFromString(svg, "image/svg+xml").documentElement, true) as unknown as SVGSVGElement;
  };

  const publish = (next: LiveryVisualRevision) => {
    revision = next;
    options.onDiagnostics?.(next.diagnostics);
    options.onRevision?.(next);
    return next;
  };

  const renderRevision = (nextSource: string): LiveryVisualRevision => {
    currentSource = nextSource;
    if (!nextSource.trim()) {
      if (revision.scene && options.retainLastValid !== false) return publish({ ...revision, status: "retained", source: nextSource, diagnostics: [] });
      rendered = undefined;
      identity = undefined;
      container.replaceChildren();
      return publish({ status: "empty", source: nextSource, diagnostics: [] });
    }
    const cached = revisionCache.get(nextSource);
    if (cached) {
      const nextRendered = parseSvg(cached.svg);
      if (rendered && identity === cached.identity) syncElementTree(rendered, nextRendered);
      else {
        rendered = nextRendered;
        container.replaceChildren(rendered);
      }
      identity = cached.identity;
      return publish(cached.revision);
    }
    const result = renderProgram(nextSource, {
      ...options,
      theme: currentTheme,
      width: currentWidth,
      ...(currentStateId ? { state: currentStateId } : {}),
    });
    if (!result.document || !result.scene || !result.svg) {
      if (revision.scene && revision.document && options.retainLastValid !== false) {
        return publish({ status: "retained", source: nextSource, diagnostics: result.diagnostics, document: revision.document, scene: revision.scene });
      }
      rendered = undefined;
      identity = undefined;
      container.replaceChildren(errorElement(container.ownerDocument, result.diagnostics));
      return publish({ status: "invalid", source: nextSource, diagnostics: result.diagnostics });
    }
    const nextRendered = parseSvg(result.svg);
    const nextIdentity = sceneIdentity(result.scene);
    if (rendered && identity === nextIdentity) syncElementTree(rendered, nextRendered);
    else {
      rendered = nextRendered;
      container.replaceChildren(rendered);
    }
    identity = nextIdentity;
    const nextRevision = { status: "ready" as const, source: nextSource, diagnostics: result.diagnostics, document: result.document, scene: result.scene };
    revisionCache.set(nextSource, { revision: nextRevision, svg: result.svg, identity: nextIdentity });
    if (revisionCache.size > 20) revisionCache.delete(revisionCache.keys().next().value!);
    return publish(nextRevision);
  };

  const initial = renderRevision(source);

  const setState = (stateId: string) => {
    const nextStateId = stateId || undefined;
    if (nextStateId === currentStateId) return;
    if (!rendered || !revision.scene || !revision.document) return;
    const timeline = revision.document.timelines.find(({ id }) => id === options.timeline) ?? revision.document.timelines[0];
    const state = timeline && nextStateId ? computeTimelineState(timeline, nextStateId, revision.scene) : undefined;
    const next = parseSvg(boardSceneToSvg(revision.scene, {
      theme: currentTheme,
      ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}),
      ...(options.icons ? { icons: options.icons } : {}),
      ...(options.resourcePolicy ? { resourcePolicy: options.resourcePolicy } : {}),
      ...(state ? { state } : {}),
      ...(options.debug ? { debug: true } : {}),
    }));
    const duration = transitionDuration(timeline, currentStateId, nextStateId, currentTheme);
    const before = capturePresentation(rendered);
    syncElementTree(rendered, next);
    animatePresentation(rendered, before, duration);
    currentStateId = nextStateId;
    revisionCache.clear();
  };

  const applyTheme = (theme: LiveryTheme | undefined) => {
    const nextTheme = theme ?? canonicalTheme;
    if (nextTheme === currentTheme) return;
    const canRepaint = layoutThemeSignature(currentTheme) === layoutThemeSignature(nextTheme);
    currentTheme = nextTheme;
    revisionCache.clear();
    if (!rendered || !revision.scene || !revision.document) return;
    if (!canRepaint) {
      renderRevision(currentSource);
      return;
    }
    const timeline = revision.document.timelines.find(({ id }) => id === options.timeline) ?? revision.document.timelines[0];
    const state = timeline && currentStateId ? computeTimelineState(timeline, currentStateId, revision.scene) : undefined;
    const next = parseSvg(boardSceneToSvg(revision.scene, {
      theme: currentTheme,
      ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}),
      ...(options.icons ? { icons: options.icons } : {}),
      ...(options.resourcePolicy ? { resourcePolicy: options.resourcePolicy } : {}),
      ...(state ? { state } : {}),
      ...(options.debug ? { debug: true } : {}),
    }));
    syncElementTree(rendered, next);
  };

  const ResizeObserverConstructor = container.ownerDocument.defaultView?.ResizeObserver;
  const resizeObserver = !options.width && options.responsive !== false && ResizeObserverConstructor
    ? new ResizeObserverConstructor((entries) => {
      const observedWidth = entries[0]?.contentRect.width ?? container.clientWidth;
      if (observedWidth <= 0) return;
      const width = normalizedWidth(observedWidth);
      if (!destroyed && width !== currentWidth) {
        currentWidth = width;
        revisionCache.clear();
        renderRevision(currentSource);
      }
    })
    : undefined;
  resizeObserver?.observe(container);

  const instance: LiveryVisualInstance = {
    get revision() { return revision; },
    get document() { return revision.document; },
    get diagnostics() { return revision.diagnostics; },
    get scene() { return revision.scene; },
    update(nextSource) { return destroyed ? revision : renderRevision(nextSource); },
    setTheme(theme) { if (!destroyed) applyTheme(theme); },
    setState,
    destroy() {
      destroyed = true;
      resizeObserver?.disconnect();
      container.replaceChildren();
    },
  };
  if (initial.status === "ready" && currentStateId) setState(currentStateId);
  return instance;
}

function layoutThemeSignature(theme: LiveryTheme) {
  return JSON.stringify({
    space: theme.tokens.space,
    type: theme.tokens.type,
    components: Object.entries(theme.components).map(([kind, recipe]) => [kind, recipe.geometry, recipe.typography, recipe.shape]),
  });
}

function normalizedWidth(width: number) {
  return Math.max(1, Math.round(Number.isFinite(width) ? width : 720));
}

function sceneIdentity(scene: BoardScene) {
  return JSON.stringify({
    elements: scene.elements.map(({ id, kind, parent }) => [id, kind, parent ?? ""]),
    connectors: scene.connectors.map(({ id, from, to }) => [id, from, to]),
    canvases: scene.canvases.map(({ id, primitives }) => [id, primitives.map(({ id: primitiveId, kind }) => [primitiveId, kind])]),
  });
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
