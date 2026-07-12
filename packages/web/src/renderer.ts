import {
  CompilerSession,
  computeFlowScene,
  type CompileRevision,
  type LiveryArtifact,
  type LiverySource,
  type Scene,
} from "@livery/core";

export type LiveryWebOptions = {
  observeResize?: boolean;
  retainLastValid?: boolean;
  width?: number;
};

export type WebRenderResult = CompileRevision & {
  retained: boolean;
};

export type LiveryWebInstance = {
  readonly result: WebRenderResult;
  destroy(): void;
  update(source: LiverySource): WebRenderResult;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let instanceCount = 0;

export function mountLivery(
  container: HTMLElement,
  source: LiverySource,
  options: LiveryWebOptions = {},
): LiveryWebInstance {
  const session = new CompilerSession();
  const markerId = `livery-web-arrow-${++instanceCount}`;
  let currentSource = source;
  let lastValid: LiveryArtifact | undefined;
  let currentArtifact: LiveryArtifact | undefined;
  let currentResult: WebRenderResult;
  let destroyed = false;

  const redraw = () => {
    container.replaceChildren(
      currentArtifact
        ? createFigure(
            container.ownerDocument,
            currentArtifact,
            currentResult,
            currentResult.retained,
            markerId,
            resolveWidth(container, options),
          )
        : createError(container.ownerDocument, currentResult),
    );
  };

  const compileAndRender = () => {
    const revision = session.compile(currentSource);
    if (revision.artifact) lastValid = revision.artifact;
    currentArtifact = revision.artifact ?? (options.retainLastValid === false ? undefined : lastValid);
    const retained = !revision.artifact && Boolean(currentArtifact);
    currentResult = { ...revision, retained };
    redraw();
    return currentResult;
  };

  currentResult = compileAndRender();
  const observer =
    options.observeResize !== false && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!destroyed) redraw();
        })
      : undefined;
  observer?.observe(container);

  return {
    get result() {
      return currentResult;
    },
    update(nextSource) {
      if (destroyed) throw new Error("Cannot update a destroyed Livery instance.");
      currentSource = nextSource;
      return compileAndRender();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      container.replaceChildren();
    },
  };
}

function resolveWidth(container: HTMLElement, options: LiveryWebOptions) {
  return options.width ?? (Math.round(container.getBoundingClientRect().width) || 720);
}

function createFigure(
  document: Document,
  artifact: LiveryArtifact,
  revision: CompileRevision,
  retained: boolean,
  markerId: string,
  width: number,
) {
  const scene = computeFlowScene(artifact, { width });
  const figure = document.createElement("figure");
  figure.className = `livery livery-${scene.direction}`;
  figure.dataset.liveryRevision = String(revision.revision);
  figure.dataset.liveryState = retained ? "retained" : revision.incomplete ? "incomplete" : "ready";
  figure.setAttribute("aria-label", scene.accessibility.summary);

  if (retained) figure.append(createDiagnostics(document, revision));
  if (scene.title) {
    const caption = document.createElement("figcaption");
    caption.className = "livery-title";
    caption.textContent = scene.title;
    figure.append(caption);
  }
  figure.append(createScene(document, scene, markerId), createAccessibilityList(document, artifact));
  return figure;
}

function createScene(document: Document, scene: Scene, markerId: string) {
  const container = document.createElement("div");
  container.className = "livery-scene";
  container.style.height = `${scene.height}px`;
  container.append(createConnections(document, scene, markerId));

  for (const node of scene.nodes) {
    const element = document.createElement("div");
    element.className = `livery-node${node.tone ? ` livery-tone-${node.tone}` : ""}`;
    element.dataset.liveryId = node.id;
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

function createConnections(document: Document, scene: Scene, markerId: string) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.classList.add("livery-connections");
  svg.setAttribute("aria-hidden", "true");
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
    group.dataset.liveryId = edge.id;
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
