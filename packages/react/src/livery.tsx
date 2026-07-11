import {
  CompilerSession,
  computeFlowScene,
  computeStoryState,
  type CompileRevision,
  type LiverySource,
  type LiveryArtifact,
  type SemanticTone,
  type StoryStep,
  type StoryState,
} from "@livery/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { resolveRenderRevision } from "./revision.js";

export type LiveryProps = {
  autoPlay?: boolean;
  compileDelay?: number;
  source: LiverySource;
  motion?: boolean;
  onCompile?: (revision: CompileRevision) => void;
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

function elementForTarget(container: HTMLElement, target: StoryStep["targets"][number]) {
  const selector = target.type === "entity" ? ".livery-node" : ".livery-edge";
  return [...container.querySelectorAll<HTMLElement | SVGGElement>(selector)].find(
    (element) => element.dataset.liveryId === target.id,
  );
}

function animateStoryStep(container: HTMLElement, step: StoryStep) {
  const animations: Animation[] = [];

  for (const target of step.targets) {
    const element = elementForTarget(container, target);
    if (!element) continue;

    if ((step.action === "reveal" || step.action === "enter") && target.type === "entity") {
      animations.push(
        element.animate(
          [
            { opacity: 0, transform: "translateY(6px) scale(0.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        ),
      );
      continue;
    }

    const path = target.type === "relationship" ? element.querySelector<SVGPathElement>(":scope > path") : undefined;
    if (step.action === "trace" && path) {
      const length = path.getTotalLength();
      animations.push(
        path.animate(
          [
            { strokeDasharray: `${length}`, strokeDashoffset: length },
            { strokeDasharray: `${length}`, strokeDashoffset: 0 },
          ],
          { duration: 420, easing: "ease-out" },
        ),
      );
      continue;
    }

    if (step.action === "focus") {
      animations.push(element.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.08)" }], {
        duration: 220,
        easing: "ease-out",
      }));
    }

    if (step.action === "indicate") {
      animations.push((path ?? element).animate(
        [{ opacity: 0.45 }, { opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }],
        { duration: 360, easing: "ease-out" },
      ));
    }
  }

  return animations;
}

export function Livery({
  autoPlay = false,
  compileDelay = 80,
  motion = true,
  onCompile,
  onStoryStepChange,
  retainLastValid = true,
  source,
  story = true,
  storyDelay = 900,
}: LiveryProps) {
  const containerRef = useRef<HTMLElement>(null);
  const compilerSession = useRef(new CompilerSession());
  const lastValidArtifact = useRef<LiveryArtifact>(undefined);
  const onCompileRef = useRef(onCompile);
  const onStoryStepChangeRef = useRef(onStoryStepChange);
  const storyAnimations = useRef<Animation[]>([]);
  const previousStoryStep = useRef(-1);
  const [width, setWidth] = useState(720);
  const [storyStep, setStoryStep] = useState(-1);
  const [playing, setPlaying] = useState(autoPlay);
  const debouncedSource = useDebouncedSource(source, Math.max(0, compileDelay));
  const result = useMemo(() => compilerSession.current.compile(debouncedSource), [debouncedSource]);
  const pending = debouncedSource !== source;
  const revision = resolveRenderRevision(result, lastValidArtifact.current, retainLastValid);
  const artifact = revision.artifact;
  if (result.artifact) lastValidArtifact.current = result.artifact;
  const storyLength = story && !revision.retained ? (artifact?.story.length ?? 0) : 0;
  onCompileRef.current = onCompile;
  onStoryStepChangeRef.current = onStoryStepChange;

  useEffect(() => {
    previousStoryStep.current = -1;
    setStoryStep(-1);
    setPlaying(autoPlay && story);
  }, [autoPlay, debouncedSource, story]);

  useEffect(() => {
    onCompileRef.current?.(result);
  }, [result]);

  useEffect(() => {
    onStoryStepChangeRef.current?.(storyStep, artifact?.story[storyStep]);
  }, [artifact, storyStep]);

  useEffect(() => {
    if (!playing) return;
    if (storyStep >= storyLength - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStoryStep((step) => step + 1), Math.max(250, storyDelay));
    return () => window.clearTimeout(timer);
  }, [playing, storyDelay, storyLength, storyStep]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setWidth(Math.round(container.getBoundingClientRect().width));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    storyAnimations.current.forEach((animation) => animation.cancel());
    storyAnimations.current = [];
    const container = containerRef.current;
    const step = revision.retained ? undefined : artifact?.story[storyStep];
    const movingForward = storyStep === previousStoryStep.current + 1;
    previousStoryStep.current = storyStep;
    if (!container || !step || !motion || !movingForward || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    storyAnimations.current = animateStoryStep(container, step);
  }, [artifact, motion, revision.retained, storyStep]);

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

  const scene = computeFlowScene(artifact, { width });
  const hasStory = story && !revision.retained && artifact.story.length > 0;
  const storyState = hasStory ? computeStoryState(artifact, storyStep) : undefined;
  const markerId = `livery-arrow-${artifact.id.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
  const atEnd = storyStep >= artifact.story.length - 1;
  const changeStoryStep = (step: number) => {
    setPlaying(false);
    setStoryStep(Math.max(-1, Math.min(step, artifact.story.length - 1)));
  };
  const replay = () => {
    previousStoryStep.current = -1;
    setStoryStep(-1);
    setPlaying(true);
  };

  return (
    <figure
      aria-label={scene.accessibility.summary}
      aria-busy={pending}
      className={`livery livery-${scene.direction}`}
      data-livery-revision={result.revision}
      data-livery-state={pending ? "pending" : revision.retained ? "retained" : result.incomplete ? "incomplete" : "ready"}
      ref={containerRef}
    >
      {revision.retained ? (
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
          aria-hidden="true"
          className="livery-connections"
          preserveAspectRatio="none"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
        >
          <defs>
            <marker id={markerId} markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
              <path className="livery-arrow" d="M 0 0 L 7 3.5 L 0 7 z" />
            </marker>
          </defs>
          {scene.edges.map((edge) => (
            <g
              className={`livery-edge${toneClass(edge.tone)}${relationshipStoryClass(edge.id, storyState)}`}
              data-livery-id={edge.id}
              key={edge.id}
            >
              <path d={edge.path} markerEnd={`url(#${markerId})`} />
              {edge.label ? (
                <text textAnchor="middle" x={edge.labelX} y={edge.labelY}>
                  {edge.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        {scene.nodes.map((node) => (
          <div
            className={`livery-node${toneClass(node.tone)}${entityStoryClass(node.id, storyState)}`}
            data-livery-id={node.id}
            key={node.id}
            style={{ height: node.height, left: node.x, top: node.y, width: node.width }}
          >
            {node.role ? <span className="livery-node-role">{node.role}</span> : null}
            <strong>{node.label}</strong>
          </div>
        ))}
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
            else if (event.key === "End") changeStoryStep(artifact.story.length - 1);
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
              : `${storyStep + 1} of ${artifact.story.length}: ${artifact.story[storyStep]!.action} ${artifact.story[storyStep]!.targets.map(({ id }) => id).join(", ")}`}
          </span>
        </div>
      ) : null}

      <ul className="livery-sr-only">
        {artifact.relationships.map((relationship) => (
          <li key={relationship.id}>
            {relationship.from} to {relationship.to}
            {relationship.label ? `: ${relationship.label}` : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
