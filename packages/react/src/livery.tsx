import { compile, computeFlowScene, type LiverySource, type SemanticTone } from "@livery/core";
import { useEffect, useMemo, useRef, useState } from "react";

export type LiveryProps = {
  source: LiverySource;
};

function toneClass(tone?: SemanticTone) {
  return tone ? ` livery-tone-${tone}` : "";
}

export function Livery({ source }: LiveryProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(720);
  const result = useMemo(() => compile(source), [source]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setWidth(Math.round(container.getBoundingClientRect().width));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (!result.artifact) {
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

  const scene = computeFlowScene(result.artifact, { width });
  const markerId = `livery-arrow-${result.artifact.id.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;

  return (
    <figure
      aria-label={scene.accessibility.summary}
      className={`livery livery-${scene.direction}`}
      data-livery-state={result.incomplete ? "incomplete" : "ready"}
      ref={containerRef}
    >
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
            <g className={`livery-edge${toneClass(edge.tone)}`} key={edge.id}>
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
            className={`livery-node${toneClass(node.tone)}`}
            data-livery-id={node.id}
            key={node.id}
            style={{ height: node.height, left: node.x, top: node.y, width: node.width }}
          >
            {node.role ? <span className="livery-node-role">{node.role}</span> : null}
            <strong>{node.label}</strong>
          </div>
        ))}
      </div>

      <ul className="livery-sr-only">
        {result.artifact.relationships.map((relationship) => (
          <li key={relationship.id}>
            {relationship.from} to {relationship.to}
            {relationship.label ? `: ${relationship.label}` : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
