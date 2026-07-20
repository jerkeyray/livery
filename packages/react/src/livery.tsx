import {
  computeStoryState,
  fastFlowLayoutAdapter,
  resolveArtifactElement,
  type ArtifactElement,
  type CompileRevision,
  type LiverySource,
  type LayoutAdapter,
  type SemanticTone,
  type StoryStep,
  type StoryState,
} from "@liveryscript/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LiveryController, type LiveryControllerRevision } from "@liveryscript/web/controller";
import {
  LayoutController,
  type LayoutControllerRevision,
  type LayoutEvent,
} from "@liveryscript/web/layout-controller";
import { animateStoryStep, prefersReducedMotion } from "@liveryscript/web/motion";

export type LiveryProps = {
  autoPlay?: boolean;
  compileDelay?: number;
  layoutAdapter?: LayoutAdapter;
  source: LiverySource;
  motion?: boolean;
  onCompile?: (revision: CompileRevision) => void;
  onActivate?: (element: ArtifactElement) => void;
  onLayout?: (event: LayoutEvent) => void;
  onStoryStepChange?: (index: number, step?: StoryStep) => void;
  retainLastValid?: boolean;
  story?: boolean;
  storyDelay?: number;
};

function toneClass(tone?: SemanticTone) {
  return tone ? ` livery-tone-${tone}` : "";
}

function useDebouncedSource(source: LiverySource, delay: number) {
  const [debouncedSource, setDebouncedSource] = useState(source);

  useEffect(() => {
    if (delay <= 0) {
      setDebouncedSource(source);
      return;
    }
    const timer = window.setTimeout(() => setDebouncedSource(source), delay);
    return () => window.clearTimeout(timer);
  }, [delay, source]);

  return debouncedSource;
}

function entityStoryClass(id: string, state?: StoryState) {
  if (!state) return "";
  return `${!state.visibleEntities.has(id) ? " livery-story-hidden" : ""}${state.focusedEntities.has(id) ? " livery-story-focused" : ""}${state.indicatedEntities.has(id) ? " livery-story-indicated" : ""}`;
}

function relationshipStoryClass(id: string, state?: StoryState) {
  if (!state) return "";
  return `${!state.visibleRelationships.has(id) ? " livery-story-hidden" : ""}${state.tracedRelationships.has(id) ? " livery-story-traced" : ""}${state.focusedRelationships.has(id) ? " livery-story-focused" : ""}${state.indicatedRelationships.has(id) ? " livery-story-indicated" : ""}`;
}

export function Livery({
  autoPlay = false,
  compileDelay = 80,
  layoutAdapter = fastFlowLayoutAdapter,
  motion = true,
  onCompile,
  onActivate,
  onLayout,
  onStoryStepChange,
  retainLastValid = true,
  source,
  story = true,
  storyDelay = 900,
}: LiveryProps) {
  const containerRef = useRef<HTMLElement>(null);
  const controller = useRef(new LiveryController());
  const layoutController = useRef(new LayoutController());
  const compilationCache = useRef<{
    retainLastValid: boolean;
    revision: LiveryControllerRevision;
    source: LiverySource;
  }>(undefined);
  const onCompileRef = useRef(onCompile);
  const onLayoutRef = useRef(onLayout);
  const onStoryStepChangeRef = useRef(onStoryStepChange);
  const storyAnimations = useRef<Animation[]>([]);
  const previousStoryStep = useRef(-1);
  const [width, setWidth] = useState(720);
  const [layoutRevision, setLayoutRevision] = useState<LayoutControllerRevision>();
  const [storyStep, setStoryStep] = useState(-1);
  const [playing, setPlaying] = useState(autoPlay);
  const debouncedSource = useDebouncedSource(source, Math.max(0, compileDelay));
  const result = useMemo(() => {
    const cached = compilationCache.current;
    if (cached?.source === debouncedSource && cached.retainLastValid === retainLastValid) return cached.revision;
    const revision = controller.current.update(debouncedSource, { retainLastValid });
    compilationCache.current = { retainLastValid, revision, source: debouncedSource };
    return revision;
  }, [debouncedSource, retainLastValid]);
  const pending = debouncedSource !== source;
  const artifact = result.renderArtifact;
  const renderArtifact = layoutRevision?.artifact;
  const scene = layoutRevision?.scene;
  const layoutPending = Boolean(artifact && (layoutRevision?.pending || renderArtifact !== artifact));
  const layoutFailed = layoutRevision?.error !== undefined;
  const hasStory = Boolean(
    story &&
      !result.retained &&
      !layoutPending &&
      renderArtifact !== undefined &&
      renderArtifact === artifact &&
      renderArtifact.story.length,
  );
  const storyLength = hasStory ? renderArtifact!.story.length : 0;
  onCompileRef.current = onCompile;
  onLayoutRef.current = onLayout;
  onStoryStepChangeRef.current = onStoryStepChange;

  useEffect(() => {
    previousStoryStep.current = -1;
    setStoryStep(-1);
    setPlaying(autoPlay && story);
  }, [autoPlay, debouncedSource, story]);

  useEffect(() => {
    onCompileRef.current?.(result);
  }, [result]);

  useLayoutEffect(
    () => layoutController.current.subscribe((event) => onLayoutRef.current?.(event)),
    [],
  );

  useEffect(() => {
    onStoryStepChangeRef.current?.(storyStep, artifact?.story[storyStep]);
  }, [artifact, storyStep]);

  useEffect(() => {
    if (!playing) return;
    if (layoutPending) return;
    if (storyStep >= storyLength - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStoryStep((step) => step + 1), Math.max(250, storyDelay));
    return () => window.clearTimeout(timer);
  }, [layoutPending, playing, storyDelay, storyLength, storyStep]);

  useLayoutEffect(() => {
    if (!artifact) {
      layoutController.current.clear();
      setLayoutRevision(undefined);
      return;
    }
    setLayoutRevision(
      layoutController.current.update(
        layoutAdapter,
        { artifact, options: { width } },
        setLayoutRevision,
      ),
    );
    return () => layoutController.current.clear();
  }, [artifact, layoutAdapter, width]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setWidth(Math.round(container.getBoundingClientRect().width));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [Boolean(artifact)]);

  useLayoutEffect(() => {
    storyAnimations.current.forEach((animation) => animation.cancel());
    storyAnimations.current = [];
    const container = containerRef.current;
    const step = result.retained || layoutPending ? undefined : renderArtifact?.story[storyStep];
    const movingForward = storyStep === previousStoryStep.current + 1;
    previousStoryStep.current = storyStep;
    if (!container || !step || !motion || !movingForward || prefersReducedMotion(container)) {
      return;
    }
    storyAnimations.current = animateStoryStep(container, step);
  }, [layoutPending, motion, renderArtifact, result.retained, storyStep]);

  if (!artifact) {
    return (
      <div className="livery-error" data-livery-state="invalid" role="alert">
        <strong>Unable to compile visual</strong>
        <ul>
          {result.diagnostics.map((item, index) => (
            <li key={`${item.code}-${index}`}>{item.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (!renderArtifact || !scene) {
    return (
      <figure
        aria-busy={layoutPending}
        aria-label={layoutFailed ? "Unable to lay out visual" : "Laying out visual"}
        className={layoutFailed ? "livery-error" : "livery-pending"}
        data-livery-state={layoutFailed ? "layout-error" : "pending-layout"}
        ref={containerRef}
        role={layoutFailed ? "alert" : undefined}
      />
    );
  }

  const storyState = hasStory && storyStep >= 0 ? computeStoryState(renderArtifact, storyStep) : undefined;
  const markerId = `livery-arrow-${renderArtifact.id.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
  const atEnd = storyStep >= renderArtifact.story.length - 1;
  const changeStoryStep = (step: number) => {
    setPlaying(false);
    setStoryStep(Math.max(-1, Math.min(step, renderArtifact.story.length - 1)));
  };
  const replay = () => {
    previousStoryStep.current = -1;
    setStoryStep(-1);
    setPlaying(true);
  };

  return (
    <figure
      aria-label={scene.accessibility.summary}
      aria-busy={pending || layoutPending}
      className={`livery livery-${scene.direction}`}
      data-livery-revision={result.revision}
      data-livery-layout={!layoutPending ? layoutRevision?.adapterId : undefined}
      data-livery-layout-fallback={!layoutPending && layoutRevision?.fallback ? "true" : undefined}
      data-livery-layout-ms={!layoutPending ? layoutRevision?.durationMs : undefined}
      data-livery-state={layoutPending ? "pending-layout" : layoutFailed ? "layout-error" : pending ? "pending" : result.retained ? "retained" : result.incomplete ? "incomplete" : "ready"}
      ref={containerRef}
    >
      {result.retained ? (
        <div aria-live="polite" className="livery-diagnostics" role="status">
          <strong>Showing last valid visual</strong>
          <ul>
            {result.diagnostics.slice(0, 3).map((item, index) => (
              <li key={`${item.code}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {scene.title ? <figcaption className="livery-title">{scene.title}</figcaption> : null}
      <div className="livery-scene" style={{ height: scene.height }}>
        <svg
          aria-hidden={onActivate ? undefined : "true"}
          className="livery-connections"
          preserveAspectRatio="none"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
        >
          <defs>
            <marker id={markerId} markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
              <path className="livery-arrow" d="M 0 0 L 7 3.5 L 0 7 z" />
            </marker>
          </defs>
          {scene.edges.map((edge) => {
            const semanticElement = resolveArtifactElement(renderArtifact, "relationship", edge.id);
            const visible = !storyState || storyState.visibleRelationships.has(edge.id);
            return (
              <g
              aria-label={onActivate && semanticElement && visible ? `${semanticElement.value.from} to ${semanticElement.value.to}${semanticElement.value.label ? `: ${semanticElement.value.label}` : ""}` : undefined}
              aria-hidden={!visible ? "true" : undefined}
              className={`livery-edge${toneClass(edge.tone)}${relationshipStoryClass(edge.id, storyState)}${onActivate && semanticElement && visible ? " livery-interactive" : ""}`}
              data-livery-id={edge.id}
              key={edge.id}
              onClick={onActivate && semanticElement && visible ? () => onActivate(semanticElement) : undefined}
              onKeyDown={onActivate && semanticElement && visible ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onActivate(semanticElement);
              } : undefined}
              role={onActivate && semanticElement && visible ? "button" : undefined}
              tabIndex={onActivate && semanticElement && visible ? 0 : undefined}
            >
              <path d={edge.path} markerEnd={`url(#${markerId})`} />
              {edge.label ? (
                <>
                  <rect
                    className="livery-edge-label-bg"
                    height="18"
                    rx="4"
                    width={Math.max(34, edge.label.length * 6.4 + 14)}
                    x={edge.labelX - Math.max(34, edge.label.length * 6.4 + 14) / 2}
                    y={edge.labelY - 13}
                  />
                  <text textAnchor="middle" x={edge.labelX} y={edge.labelY}>
                    {edge.label}
                  </text>
                </>
              ) : null}
              </g>
            );
          })}
        </svg>

        {scene.nodes.map((node) => {
          const semanticElement = resolveArtifactElement(renderArtifact, "entity", node.id);
          const visible = !storyState || storyState.visibleEntities.has(node.id);
          return (
            <div
            aria-label={onActivate && semanticElement && visible ? semanticElement.value.label : undefined}
            aria-hidden={!visible ? "true" : undefined}
            className={`livery-node${node.role ? ` livery-role-${node.role}` : ""}${toneClass(node.tone)}${entityStoryClass(node.id, storyState)}${onActivate && semanticElement && visible ? " livery-interactive" : ""}`}
            data-livery-id={node.id}
            key={node.id}
            onClick={onActivate && semanticElement && visible ? () => onActivate(semanticElement) : undefined}
            onKeyDown={onActivate && semanticElement && visible ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onActivate(semanticElement);
            } : undefined}
            role={onActivate && semanticElement && visible ? "button" : undefined}
            style={{ height: node.height, left: node.x, top: node.y, width: node.width }}
            tabIndex={onActivate && semanticElement && visible ? 0 : undefined}
          >
            {node.role ? <span className="livery-node-role">{node.role}</span> : null}
            <strong>{node.label}</strong>
            </div>
          );
        })}
      </div>

      {hasStory ? (
        <div
          aria-label="Story controls"
          className="livery-story-controls"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") changeStoryStep(storyStep - 1);
            else if (event.key === "ArrowRight") changeStoryStep(storyStep + 1);
            else if (event.key === "Home") changeStoryStep(-1);
            else if (event.key === "End") changeStoryStep(renderArtifact.story.length - 1);
            else if (event.key === " ") atEnd ? replay() : setPlaying((value) => !value);
            else return;
            event.preventDefault();
          }}
          role="group"
          tabIndex={0}
        >
          <div className="livery-story-buttons">
            <button disabled={storyStep < 0} onClick={() => changeStoryStep(storyStep - 1)} type="button">
              Previous
            </button>
            {atEnd ? (
              <button onClick={replay} type="button">
                Replay
              </button>
            ) : (
              <button aria-pressed={playing} onClick={() => setPlaying((value) => !value)} type="button">
                {playing ? "Pause" : "Play"}
              </button>
            )}
            <button disabled={atEnd} onClick={() => changeStoryStep(storyStep + 1)} type="button">
              Next
            </button>
          </div>
          <span aria-live="polite">
            {storyStep < 0
              ? "Ready"
              : `${storyStep + 1} of ${renderArtifact.story.length}: ${renderArtifact.story[storyStep]!.action} ${renderArtifact.story[storyStep]!.targets.map(({ id }) => id).join(", ")}`}
          </span>
        </div>
      ) : null}

      <ul className="livery-sr-only">
        {renderArtifact.relationships.map((relationship) => (
          <li key={relationship.id}>
            {relationship.from} to {relationship.to}
            {relationship.label ? `: ${relationship.label}` : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
