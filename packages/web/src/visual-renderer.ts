import {
  compileVisual,
  computeTimelineState,
  solvePinboard,
  boardSceneToSvg,
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
  const result = compileVisual(source);
  if (!result.document) {
    container.replaceChildren(errorElement(container.ownerDocument, result.diagnostics));
    return { diagnostics: result.diagnostics, setState() {}, destroy: () => container.replaceChildren() };
  }
  const document = result.document;
  const width = options.width ?? (container.clientWidth || 720);
  const layout = solvePinboard(document, {
    width,
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}),
  });
  if (!layout.ok) {
    const diagnostics = [...result.diagnostics, ...layout.diagnostics];
    container.replaceChildren(errorElement(container.ownerDocument, diagnostics));
    return { document, diagnostics, setState() {}, destroy: () => container.replaceChildren() };
  }
  const scene = layout.scene;
  const timeline = document.timelines.find(({ id }) => id === options.timeline) ?? document.timelines[0];
  const render = (stateId?: string) => {
    const state = timeline && stateId ? computeTimelineState(timeline, stateId, scene) : undefined;
    const svg = boardSceneToSvg(scene, { ...(options.theme ? { theme: options.theme } : {}), ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}), ...(state ? { state } : {}), ...(options.debug ? { debug: true } : {}) });
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const rendered = container.ownerDocument.importNode(parsed, true);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rendered.setAttribute("style", "opacity:0;transition:opacity 220ms ease");
      requestAnimationFrame(() => rendered.setAttribute("style", "opacity:1;transition:opacity 220ms ease"));
    }
    container.replaceChildren(rendered);
  };
  render(options.state);
  return { document, diagnostics: result.diagnostics, scene, setState: render, destroy: () => container.replaceChildren() };
}

function errorElement(document: Document, diagnostics: Diagnostic[]) {
  const element = document.createElement("div");
  element.className = "livery-error";
  element.setAttribute("role", "alert");
  element.textContent = diagnostics.map(({ message }) => message).join(" ");
  return element;
}
