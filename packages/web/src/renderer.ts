import {
  computeStoryState,
  fastFlowLayoutAdapter,
  resolveArtifactElement,
  type ArtifactElement,
  type CompileRevision,
  type LiveryArtifact,
  type LiverySource,
  type LayoutAdapter,
  type Scene,
  type StoryStep,
  type StoryState,
} from "@livery/core";

import { animateStoryStep, prefersReducedMotion } from "./motion.js";
import { LiveryController, type LiveryControllerRevision } from "./controller.js";
import { LayoutController, type LayoutControllerRevision } from "./layout-controller.js";

export type LiveryWebOptions = {
  autoPlay?: boolean;
  layoutAdapter?: LayoutAdapter;
  motion?: boolean;
  observeResize?: boolean;
  onActivate?: (element: ArtifactElement) => void;
  onStoryStepChange?: (index: number) => void;
  retainLastValid?: boolean;
  story?: boolean;
  storyControls?: boolean;
  storyDelay?: number;
  width?: number;
};

export type WebRenderResult = LiveryControllerRevision;

export type LiveryWebInstance = {
  readonly result: WebRenderResult;
  readonly playing: boolean;
  readonly storyStep: number;
  destroy(): void;
  next(): void;
  pause(): void;
  play(): void;
  previous(): void;
  replay(): void;
  setStoryStep(step: number): void;
  update(source: LiverySource): WebRenderResult;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let instanceCount = 0;

export function mountLivery(
  container: HTMLElement,
  source: LiverySource,
  options: LiveryWebOptions = {},
): LiveryWebInstance {
  const controller = new LiveryController();
  const layoutController = new LayoutController();
  const markerId = `livery-web-arrow-${++instanceCount}`;
  let currentSource = source;
  let currentArtifact = controller.revision?.renderArtifact;
  let currentResult: WebRenderResult;
  let currentLayout: LayoutControllerRevision | undefined;
  let destroyed = false;
  let playing = false;
  let storyStep = -1;
  let storyTimer: number | undefined;
  let activeAnimations: Animation[] = [];

  const storyEnabled = () =>
    options.story !== false &&
    !currentResult.retained &&
    !currentLayout?.pending &&
    currentLayout?.artifact === currentArtifact &&
    Boolean(currentArtifact?.story.length);

  const stopTimer = () => {
    if (storyTimer !== undefined) window.clearTimeout(storyTimer);
    storyTimer = undefined;
  };

  const redraw = (motionStep?: StoryStep) => {
    activeAnimations.forEach((animation) => animation.cancel());
    activeAnimations = [];
    const renderArtifact = currentLayout?.artifact;
    const scene = currentLayout?.scene;
    const layoutPending = currentLayout?.pending ?? false;
    const layoutFailed = currentLayout?.error !== undefined;
    const storyActive = storyEnabled();
    container.replaceChildren(
      renderArtifact && scene
        ? createFigure(
            container.ownerDocument,
            renderArtifact,
            scene,
            currentResult,
            currentResult.retained,
            markerId,
            storyActive ? computeStoryState(renderArtifact, storyStep) : undefined,
            storyActive && options.storyControls !== false ? storyControls : undefined,
            options.onActivate,
            layoutPending,
            layoutFailed,
          )
        : currentArtifact && currentLayout?.pending
          ? createPending(container.ownerDocument)
          : currentArtifact && currentLayout?.error
            ? createLayoutError(container.ownerDocument)
          : createError(container.ownerDocument, currentResult),
    );
    if (motionStep && options.motion !== false && !prefersReducedMotion(container)) {
      activeAnimations = animateStoryStep(container, motionStep);
    }
  };

  const requestLayout = () => {
    if (!currentArtifact) {
      layoutController.clear();
      currentLayout = undefined;
      redraw();
      return;
    }
    currentLayout = layoutController.update(
      options.layoutAdapter ?? fastFlowLayoutAdapter,
      { artifact: currentArtifact, options: { width: resolveWidth(container, options) } },
      (revision) => {
        if (destroyed) return;
        currentLayout = revision;
        redraw();
        if (options.autoPlay && storyStep === -1) play();
      },
    );
    redraw();
  };

  const setStep = (nextStep: number, stopPlayback = true) => {
    if (!currentArtifact || !storyEnabled()) return;
    if (stopPlayback) {
      playing = false;
      stopTimer();
    }
    const previousStep = storyStep;
    storyStep = Math.max(-1, Math.min(nextStep, currentArtifact.story.length - 1));
    const motionStep = storyStep === previousStep + 1 ? currentArtifact.story[storyStep] : undefined;
    redraw(motionStep);
    options.onStoryStepChange?.(storyStep);
  };

  const scheduleStep = () => {
    stopTimer();
    if (!playing || !currentArtifact || storyStep >= currentArtifact.story.length - 1) {
      playing = false;
      redraw();
      return;
    }
    storyTimer = window.setTimeout(() => {
      setStep(storyStep + 1, false);
      scheduleStep();
    }, Math.max(250, options.storyDelay ?? 900));
  };

  const play = () => {
    if (!currentArtifact || !storyEnabled() || playing) return;
    if (storyStep >= currentArtifact.story.length - 1) storyStep = -1;
    playing = true;
    redraw();
    scheduleStep();
  };

  const pause = () => {
    if (!playing) return;
    playing = false;
    stopTimer();
    redraw();
  };

  const replay = () => {
    if (!storyEnabled()) return;
    storyStep = -1;
    playing = true;
    redraw();
    options.onStoryStepChange?.(storyStep);
    scheduleStep();
  };

  const storyControls: StoryControlActions = {
    get atEnd() {
      return Boolean(currentArtifact && storyStep >= currentArtifact.story.length - 1);
    },
    get playing() {
      return playing;
    },
    get step() {
      return storyStep;
    },
    next: () => setStep(storyStep + 1),
    pause,
    play,
    previous: () => setStep(storyStep - 1),
    replay,
    setStep,
  };

  const compileAndRender = () => {
    playing = false;
    storyStep = -1;
    stopTimer();
    currentResult = controller.update(
      currentSource,
      options.retainLastValid === undefined ? {} : { retainLastValid: options.retainLastValid },
    );
    currentArtifact = currentResult.renderArtifact;
    requestLayout();
    return currentResult;
  };

  currentResult = compileAndRender();
  const observer =
    options.observeResize !== false && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!destroyed) requestLayout();
        })
      : undefined;
  observer?.observe(container);
  if (options.autoPlay) play();

  return {
    get result() {
      return currentResult;
    },
    get playing() {
      return playing;
    },
    get storyStep() {
      return storyStep;
    },
    update(nextSource) {
      if (destroyed) throw new Error("Cannot update a destroyed Livery instance.");
      currentSource = nextSource;
      const result = compileAndRender();
      if (options.autoPlay) play();
      return result;
    },
    next: storyControls.next,
    pause,
    play,
    previous: storyControls.previous,
    replay,
    setStoryStep: setStep,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTimer();
      activeAnimations.forEach((animation) => animation.cancel());
      activeAnimations = [];
      layoutController.destroy();
      observer?.disconnect();
      container.replaceChildren();
    },
  };
}

type StoryControlActions = {
  readonly atEnd: boolean;
  readonly playing: boolean;
  readonly step: number;
  next(): void;
  pause(): void;
  play(): void;
  previous(): void;
  replay(): void;
  setStep(step: number): void;
};

function resolveWidth(container: HTMLElement, options: LiveryWebOptions) {
  return options.width ?? (Math.round(container.getBoundingClientRect().width) || 720);
}

function createFigure(
  document: Document,
  artifact: LiveryArtifact,
  scene: Scene,
  revision: CompileRevision,
  retained: boolean,
  markerId: string,
  storyState?: StoryState,
  controls?: StoryControlActions,
  onActivate?: (element: ArtifactElement) => void,
  layoutPending = false,
  layoutFailed = false,
) {
  const figure = document.createElement("figure");
  figure.className = `livery livery-${scene.direction}`;
  figure.dataset.liveryRevision = String(revision.revision);
  figure.dataset.liveryState = layoutPending
    ? "pending-layout"
    : layoutFailed
      ? "layout-error"
      : retained
        ? "retained"
        : revision.incomplete
          ? "incomplete"
          : "ready";
  figure.setAttribute("aria-busy", String(layoutPending));
  figure.setAttribute("aria-label", scene.accessibility.summary);

  if (retained) figure.append(createDiagnostics(document, revision));
  if (scene.title) {
    const caption = document.createElement("figcaption");
    caption.className = "livery-title";
    caption.textContent = scene.title;
    figure.append(caption);
  }
  figure.append(
    createScene(document, artifact, scene, markerId, storyState, onActivate),
    createAccessibilityList(document, artifact),
  );
  if (controls) figure.append(createStoryControls(document, artifact, controls));
  return figure;
}

function createPending(document: Document) {
  const pending = document.createElement("div");
  pending.className = "livery-pending";
  pending.dataset.liveryState = "pending-layout";
  pending.setAttribute("aria-busy", "true");
  pending.setAttribute("aria-label", "Laying out visual");
  return pending;
}

function createLayoutError(document: Document) {
  const error = document.createElement("div");
  error.className = "livery-error";
  error.dataset.liveryState = "layout-error";
  error.setAttribute("role", "alert");
  error.textContent = "Unable to lay out visual";
  return error;
}

function createScene(
  document: Document,
  artifact: LiveryArtifact,
  scene: Scene,
  markerId: string,
  storyState?: StoryState,
  onActivate?: (element: ArtifactElement) => void,
) {
  const container = document.createElement("div");
  container.className = "livery-scene";
  container.style.height = `${scene.height}px`;
  container.append(createConnections(document, artifact, scene, markerId, storyState, onActivate));

  for (const node of scene.nodes) {
    const element = document.createElement("div");
    element.className = `livery-node${node.tone ? ` livery-tone-${node.tone}` : ""}`;
    applyEntityStoryClasses(element, node.id, storyState);
    element.dataset.liveryId = node.id;
    const semanticElement = resolveArtifactElement(artifact, "entity", node.id);
    if (semanticElement && onActivate) {
      makeInteractive(element, semanticElement, onActivate, node.label);
    }
    Object.assign(element.style, {
      height: `${node.height}px`,
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width}px`,
    });
    if (node.role) {
      const role = document.createElement("span");
      role.className = "livery-node-role";
      role.textContent = node.role;
      element.append(role);
    }
    const label = document.createElement("strong");
    label.textContent = node.label;
    element.append(label);
    container.append(element);
  }
  return container;
}

function createConnections(
  document: Document,
  artifact: LiveryArtifact,
  scene: Scene,
  markerId: string,
  storyState?: StoryState,
  onActivate?: (element: ArtifactElement) => void,
) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.classList.add("livery-connections");
  if (!onActivate) svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
  const definitions = document.createElementNS(SVG_NAMESPACE, "defs");
  const marker = document.createElementNS(SVG_NAMESPACE, "marker");
  for (const [name, value] of Object.entries({ id: markerId, markerHeight: "7", markerWidth: "7", orient: "auto", refX: "6", refY: "3.5" })) {
    marker.setAttribute(name, value);
  }
  const arrow = document.createElementNS(SVG_NAMESPACE, "path");
  arrow.classList.add("livery-arrow");
  arrow.setAttribute("d", "M 0 0 L 7 3.5 L 0 7 z");
  marker.append(arrow);
  definitions.append(marker);
  svg.append(definitions);

  for (const edge of scene.edges) {
    const group = document.createElementNS(SVG_NAMESPACE, "g");
    group.classList.add("livery-edge");
    if (edge.tone) group.classList.add(`livery-tone-${edge.tone}`);
    applyRelationshipStoryClasses(group, edge.id, storyState);
    group.dataset.liveryId = edge.id;
    const semanticElement = resolveArtifactElement(artifact, "relationship", edge.id);
    if (semanticElement && onActivate) {
      const relationship = semanticElement.value;
      makeInteractive(
        group,
        semanticElement,
        onActivate,
        `${relationship.from} to ${relationship.to}${relationship.label ? `: ${relationship.label}` : ""}`,
      );
    }
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", edge.path);
    path.setAttribute("marker-end", `url(#${markerId})`);
    group.append(path);
    if (edge.label) {
      const label = document.createElementNS(SVG_NAMESPACE, "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("x", String(edge.labelX));
      label.setAttribute("y", String(edge.labelY));
      label.textContent = edge.label;
      group.append(label);
    }
    svg.append(group);
  }
  return svg;
}

function makeInteractive(
  element: HTMLElement | SVGElement,
  semanticElement: ArtifactElement,
  onActivate: (element: ArtifactElement) => void,
  label: string,
) {
  element.classList.add("livery-interactive");
  const hidden = element.classList.contains("livery-story-hidden");
  if (hidden) {
    element.setAttribute("aria-hidden", "true");
    return;
  }
  element.setAttribute("aria-label", label);
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.addEventListener("click", () => onActivate(semanticElement));
  element.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== "Enter" && key !== " ") return;
    event.preventDefault();
    onActivate(semanticElement);
  });
}

function applyEntityStoryClasses(element: Element, id: string, state?: StoryState) {
  if (!state) return;
  if (!state.visibleEntities.has(id)) element.classList.add("livery-story-hidden");
  if (state.focusedEntities.has(id)) element.classList.add("livery-story-focused");
  if (state.indicatedEntities.has(id)) element.classList.add("livery-story-indicated");
}

function applyRelationshipStoryClasses(element: Element, id: string, state?: StoryState) {
  if (!state) return;
  if (!state.visibleRelationships.has(id)) element.classList.add("livery-story-hidden");
  if (state.focusedRelationships.has(id)) element.classList.add("livery-story-focused");
  if (state.indicatedRelationships.has(id)) element.classList.add("livery-story-indicated");
  if (state.tracedRelationships.has(id)) element.classList.add("livery-story-traced");
}

function createStoryControls(document: Document, artifact: LiveryArtifact, controls: StoryControlActions) {
  const container = document.createElement("div");
  container.className = "livery-story-controls";
  container.setAttribute("aria-label", "Story controls");
  container.setAttribute("role", "group");
  container.tabIndex = 0;
  const buttons = document.createElement("div");
  buttons.className = "livery-story-buttons";
  buttons.append(
    storyButton(document, "Previous", controls.previous, controls.step < 0),
    controls.atEnd
      ? storyButton(document, "Replay", controls.replay)
      : storyButton(document, controls.playing ? "Pause" : "Play", controls.playing ? controls.pause : controls.play),
    storyButton(document, "Next", controls.next, controls.atEnd),
  );
  const status = document.createElement("span");
  status.setAttribute("aria-live", "polite");
  const step = artifact.story[controls.step];
  status.textContent = step
    ? `${controls.step + 1} of ${artifact.story.length}: ${step.action} ${step.targets.map(({ id }) => id).join(", ")}`
    : "Ready";
  container.addEventListener("keydown", (event) => {
    if (event.target !== container) return;
    if (event.key === "ArrowLeft") controls.previous();
    else if (event.key === "ArrowRight") controls.next();
    else if (event.key === "Home") controls.setStep(-1);
    else if (event.key === "End") controls.setStep(artifact.story.length - 1);
    else if (event.key === " ") controls.playing ? controls.pause() : controls.atEnd ? controls.replay() : controls.play();
    else return;
    event.preventDefault();
  });
  container.append(buttons, status);
  return container;
}

function storyButton(document: Document, label: string, action: () => void, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  if (label === "Play" || label === "Pause") button.setAttribute("aria-pressed", String(label === "Pause"));
  button.addEventListener("click", action);
  return button;
}

function createDiagnostics(document: Document, revision: CompileRevision) {
  const container = document.createElement("div");
  container.className = "livery-diagnostics";
  container.setAttribute("role", "status");
  const title = document.createElement("strong");
  title.textContent = "Showing last valid visual";
  const list = document.createElement("ul");
  for (const diagnostic of revision.diagnostics.slice(0, 3)) {
    const item = document.createElement("li");
    item.textContent = diagnostic.message;
    list.append(item);
  }
  container.append(title, list);
  return container;
}

function createError(document: Document, revision: CompileRevision) {
  const container = document.createElement("div");
  container.className = "livery-error";
  container.dataset.liveryState = "invalid";
  container.setAttribute("role", "alert");
  const title = document.createElement("strong");
  title.textContent = "Unable to compile visual";
  const list = document.createElement("ul");
  for (const diagnostic of revision.diagnostics) {
    const item = document.createElement("li");
    item.textContent = diagnostic.message;
    list.append(item);
  }
  container.append(title, list);
  return container;
}

function createAccessibilityList(document: Document, artifact: LiveryArtifact) {
  const list = document.createElement("ul");
  list.className = "livery-sr-only";
  for (const relationship of artifact.relationships) {
    const item = document.createElement("li");
    item.textContent = `${relationship.from} to ${relationship.to}${relationship.label ? `: ${relationship.label}` : ""}`;
    list.append(item);
  }
  return list;
}
