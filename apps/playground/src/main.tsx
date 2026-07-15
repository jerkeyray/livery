import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compileVisual, formatVisualDocument, render } from "@jerkeyray/core";
import { LiveryVisual } from "@jerkeyray/react";
import { mountLiveryVisual, type LiveryVisualInstance } from "@jerkeyray/web";
import { AlignLeft, Bug, Check, ChevronLeft, ChevronRight, Code2, Copy, Download, Eye, Library, Maximize2, Minus, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, Settings2, TriangleAlert } from "lucide-react";

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@jerkeyray/web/styles.css";
import "@jerkeyray/react/styles.css";
import "./styles.css";
import { LiveryEditor } from "./LiveryEditor.js";
import agentTraceSource from "../../../fixtures/visual/agent-trace.livery?raw";
import checkoutSource from "../../../fixtures/visual/checkout-board.livery?raw";
import dataTransformSource from "../../../fixtures/visual/data-pipeline-canvas.livery?raw";
import mechanismSource from "../../../fixtures/visual/mechanism.livery?raw";
import scientificSource from "../../../fixtures/visual/scientific-motion.livery?raw";

const initialSource = checkoutSource;
const STORAGE_KEY = "livery.playground.source";
const starterSource = `figure request_path("Request path") {
 client = person("Client")
 api = api("Application API")
 request = client.right -> api.left("request")
 row(client, api, gap: xl)
}
`;

const studioExamples = [
  { id: "starter", label: "Starter", description: "Two components and one connection", file: "starter.livery", source: starterSource },
  { id: "checkout", label: "System", description: "Responsive architecture with states", file: "checkout.livery", source: initialSource },
  { id: "mechanism", label: "Canvas", description: "Custom illustration with annotations", file: "mechanism.livery", source: mechanismSource },
] as const;

const qualityExamples = [
  { id: "checkout", label: "Checkout flow", source: checkoutSource },
  { id: "mechanism", label: "Valve mechanism", source: mechanismSource },
  { id: "data-transform", label: "Data transformation", source: dataTransformSource },
  { id: "scientific", label: "Orbital motion", source: scientificSource },
  { id: "agent-trace", label: "Agent tool trace", source: agentTraceSource },
] as const;
const galleryWidths = [320, 480, 720, 1024] as const;

function Playground() {
  const restoredSource = useMemo(() => readStoredSource(), []);
  const initialExample = studioExamples.find(({ source }) => source === restoredSource);
  const [source, setSource] = useState(restoredSource);
  const [exampleId, setExampleId] = useState<string>(initialExample?.id ?? "custom");
  const [pendingExampleId, setPendingExampleId] = useState<string>();
  const [renderer, setRenderer] = useState<"react" | "web">("react");
  const [viewport, setViewport] = useState<"full" | "chat">("full");
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("preview");
  const [debug, setDebug] = useState(false);
  const [editorPercent, setEditorPercent] = useState(42);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const examplesRef = useRef<HTMLDetailsElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const width = viewport === "chat" ? 360 : 760;
  const compilation = useMemo(() => render(source, { width }), [source, width]);
  const timeline = compilation.document?.timelines[0];
  const [state, setState] = useState<string>();
  const activeState = timeline?.states.some(({ id }) => id === state) ? state : undefined;
  const previewSvg = useMemo(() => activeState ? render(source, { width, state: activeState, ...(timeline ? { timeline: timeline.id } : {}) }).svg : compilation.svg, [activeState, compilation.svg, source, timeline?.id, width]);
  const selectedExample = studioExamples.find(({ id }) => id === exampleId);

  const errors = compilation.diagnostics.filter(({ severity }) => severity === "error");
  const applyExample = (id: string) => {
    const example = studioExamples.find((candidate) => candidate.id === id);
    if (!example) return;
    setSource(example.source);
    setExampleId(example.id);
    setPendingExampleId(undefined);
    setState(undefined);
    setPlaying(false);
    examplesRef.current?.removeAttribute("open");
  };
  const chooseExample = (id: string) => {
    const cleanSource = selectedExample?.source === source;
    if (cleanSource) applyExample(id);
    else setPendingExampleId(id);
  };
  const timelineIds = timeline?.states.map(({ id }) => id) ?? [];
  const stepState = (direction: -1 | 1) => {
    if (!timelineIds.length) return;
    const current = activeState ? timelineIds.indexOf(activeState) : -1;
    const next = Math.max(0, Math.min(timelineIds.length - 1, current + direction));
    setState(timelineIds[next]);
  };
  const resetView = () => {
    setZoom(1);
    stageRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  };

  useEffect(() => { localStorage.setItem(STORAGE_KEY, source); }, [source]);
  useEffect(() => {
    if (!playing || !timelineIds.length) return;
    const index = activeState ? timelineIds.indexOf(activeState) : -1;
    if (index >= timelineIds.length - 1) { setPlaying(false); return; }
    const timeout = window.setTimeout(() => setState(timelineIds[index + 1]), 900);
    return () => window.clearTimeout(timeout);
  }, [activeState, playing, timeline?.id, timelineIds.join(":")]);

  return (
    <div className="studio">
      <header className="app-bar">
        <div className="brand"><img alt="" aria-hidden className="brand-mark" src="/livery-mark.svg" /><strong>Livery</strong><span>Playground</span></div>
      </header>
      <nav aria-label="Workspace view" className="mobile-tabs">
        <button aria-selected={mobilePane === "source"} onClick={() => setMobilePane("source")} role="tab" type="button"><Code2 aria-hidden size={15} />Source</button>
        <button aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")} role="tab" type="button"><Eye aria-hidden size={15} />Preview</button>
      </nav>
      <main className={editorCollapsed ? "workbench editor-collapsed" : "workbench"} style={{ "--editor-width": `${editorPercent}%` } as CSSProperties}>
        <section className={`workspace-pane editor-pane${mobilePane === "source" ? " mobile-active" : ""}`}>
          <div className="pane-header">
            <div className="pane-title"><Code2 aria-hidden size={15} /><strong>Source</strong><span>{selectedExample?.file ?? "custom.livery"}</span><CompileStatus errors={errors.length} /></div>
            <div className="editor-header-actions">
              <button
                aria-label="Format source"
                className="editor-icon-button"
                onClick={() => setSource(formatEditorSource(source))}
                title="Format source"
                type="button"
              >
                <AlignLeft aria-hidden size={14} />
              </button>
              <details className="examples-menu" ref={examplesRef}>
                <summary><Library aria-hidden size={14} /><span>Examples</span></summary>
                <div className="examples-popover">
                  {pendingExampleId ? (
                    <div className="replace-confirmation">
                      <strong>Replace edited source?</strong>
                      <span>This replaces the current editor contents.</span>
                      <div><button onClick={() => setPendingExampleId(undefined)} type="button">Cancel</button><button className="danger-action" onClick={() => applyExample(pendingExampleId)} type="button">Replace</button></div>
                    </div>
                  ) : studioExamples.map((example) => (
                    <button aria-current={example.id === exampleId ? "true" : undefined} key={example.id} onClick={() => chooseExample(example.id)} type="button"><strong>{example.label}</strong><span>{example.description}</span></button>
                  ))}
                </div>
              </details>
              <span className="pane-meta">{source.split("\n").length} lines</span>
              <button aria-label="Collapse source panel" className="editor-icon-button collapse-button" onClick={() => setEditorCollapsed(true)} title="Collapse source panel" type="button"><PanelLeftClose aria-hidden size={14} /></button>
            </div>
          </div>
          <LiveryEditor diagnostics={compilation.diagnostics} onChange={(nextSource) => { setSource(nextSource); setExampleId("custom"); }} source={source} />
          {compilation.diagnostics.length > 0 && (
            <div className="diagnostics" role="status">
              {compilation.diagnostics.slice(0, 3).map((diagnostic) => <div key={`${diagnostic.code}:${diagnostic.span?.start.offset ?? 0}`}><TriangleAlert aria-hidden size={13} /><span>{diagnostic.message}</span></div>)}
            </div>
          )}
        </section>
        <div aria-label="Resize source and preview panels" aria-orientation="vertical" className="pane-resizer" onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setEditorPercent((value) => Math.max(28, value - 2));
          if (event.key === "ArrowRight") setEditorPercent((value) => Math.min(65, value + 2));
        }} onPointerDown={(event) => startPanelResize(event, setEditorPercent)} role="separator" tabIndex={0} />
        <section aria-label="Preview" className={`workspace-pane preview-pane${mobilePane === "preview" ? " mobile-active" : ""}`}>
          <div className="pane-header preview-header">
            <div className="pane-title">{editorCollapsed && <button aria-label="Open source panel" className="editor-icon-button" onClick={() => setEditorCollapsed(false)} title="Open source panel" type="button"><PanelLeftOpen aria-hidden size={14} /></button>}<Eye aria-hidden size={15} /><strong>Preview</strong><span>{width}px</span></div>
            <div className="preview-controls">
              <div aria-label="Viewport" className="segmented-control" role="group">
                <button aria-pressed={viewport === "full"} onClick={() => setViewport("full")} type="button">Full</button>
                <button aria-pressed={viewport === "chat"} onClick={() => setViewport("chat")} type="button">Chat</button>
              </div>
              <div aria-label="Preview zoom" className="icon-control" role="group"><button aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} title="Zoom out" type="button"><Minus aria-hidden size={14} /></button><button aria-label="Fit preview" onClick={resetView} title="Fit preview" type="button"><Maximize2 aria-hidden size={14} /></button><button aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} title="Zoom in" type="button"><Plus aria-hidden size={14} /></button></div>
              <button aria-label="Copy SVG" className="toolbar-icon-button" disabled={!previewSvg} onClick={() => void copySvg(previewSvg, setCopied)} title={copied ? "Copied" : "Copy SVG"} type="button">{copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}</button>
              <button aria-label="Download SVG" className="toolbar-icon-button" disabled={!previewSvg} onClick={() => downloadSvg(previewSvg, compilation.document?.id ?? "livery-visual")} title="Download SVG" type="button"><Download aria-hidden size={14} /></button>
              <details className="options-menu">
                <summary aria-label="Preview options" title="Preview options"><Settings2 aria-hidden size={14} /></summary>
                <div className="options-popover">
                  <span>Renderer</span><div aria-label="Renderer" className="segmented-control" role="group"><button aria-pressed={renderer === "react"} onClick={() => setRenderer("react")} type="button">React</button><button aria-pressed={renderer === "web"} onClick={() => setRenderer("web")} type="button">Web</button></div>
                  <label className="debug-toggle" title="Show solved geometry"><Bug aria-hidden size={14} /><span>Debug geometry</span><input checked={debug} onChange={(event) => setDebug(event.target.checked)} type="checkbox" /></label>
                </div>
              </details>
            </div>
          </div>
          {timeline && <div className="timeline-bar">
            <span>Timeline</span>
            <div aria-label="Timeline playback" className="timeline-playback" role="group"><button aria-label="Previous state" disabled={!activeState || activeState === timelineIds[0]} onClick={() => stepState(-1)} type="button"><ChevronLeft aria-hidden size={14} /></button><button aria-label={playing ? "Pause timeline" : "Play timeline"} onClick={() => { if (!activeState || activeState === timelineIds.at(-1)) setState(timelineIds[0]); setPlaying((value) => !value); }} type="button">{playing ? <Pause aria-hidden size={13} /> : <Play aria-hidden size={13} />}</button><button aria-label="Next state" disabled={activeState === timelineIds.at(-1)} onClick={() => stepState(1)} type="button"><ChevronRight aria-hidden size={14} /></button></div>
            <div className="timeline-controls" role="group" aria-label="Timeline state">
              <button aria-pressed={!activeState} onClick={() => { setState(undefined); setPlaying(false); }} type="button">Overview</button>
              {timeline?.states.map(({ id }, index) => (
                <button aria-pressed={activeState === id} key={id} onClick={() => { setState(id); setPlaying(false); }} type="button"><span aria-hidden>{index + 1}</span>{id}</button>
              ))}
            </div>
          </div>}
          <div className="preview-stage" ref={stageRef}>
            <div className={viewport === "chat" ? "preview-frame preview-frame-chat" : "preview-frame"} style={{ "--preview-zoom": zoom } as CSSProperties}>
              {renderer === "react" ? (
                <LiveryVisual debug={debug} source={source} width={width} {...(activeState ? { state: activeState } : {})} {...(timeline ? { timeline: timeline.id } : {})} />
              ) : (
                <WebPreview debug={debug} source={source} width={width} {...(activeState ? { state: activeState } : {})} {...(timeline ? { timeline: timeline.id } : {})} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function CompileStatus({ errors }: { errors: number }) {
  return <span className={errors ? "compile-status compile-status-error" : "compile-status"}>{errors ? <TriangleAlert aria-hidden size={12} /> : <Check aria-hidden size={12} />}{errors ? `${errors} ${errors === 1 ? "error" : "errors"}` : "Ready"}</span>;
}

function readStoredSource() {
  try { return localStorage.getItem(STORAGE_KEY) ?? initialSource; }
  catch { return initialSource; }
}

function startPanelResize(event: ReactPointerEvent, setEditorPercent: (updater: (value: number) => number) => void) {
  event.preventDefault();
  const workbench = event.currentTarget.parentElement;
  if (!workbench) return;
  const move = (pointer: PointerEvent) => {
    const bounds = workbench.getBoundingClientRect();
    const next = ((pointer.clientX - bounds.left) / bounds.width) * 100;
    setEditorPercent(() => Math.max(28, Math.min(65, next)));
  };
  const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); document.body.classList.remove("resizing-panels"); };
  document.body.classList.add("resizing-panels");
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
}

async function copySvg(svg: string | undefined, setCopied: (value: boolean) => void) {
  if (!svg) return;
  try {
    await navigator.clipboard.writeText(svg);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  } catch {
    setCopied(false);
  }
}

function downloadSvg(svg: string | undefined, id: string) {
  if (!svg) return;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatEditorSource(source: string) {
  if (/^\s*component\b/m.test(source)) return `${source.split("\n").map((line) => line.trimEnd()).join("\n").trim()}\n`;
  const result = compileVisual(source);
  return result.document && !result.diagnostics.some(({ severity }) => severity === "error")
    ? `${formatVisualDocument(result.document)}\n`
    : source;
}

function WebPreview({ debug, source, state, timeline, width }: { debug: boolean; source: string; state?: string; timeline?: string; width: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LiveryVisualInstance>(undefined);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    instanceRef.current = mountLiveryVisual(host, source, { debug, width, ...(timeline ? { timeline } : {}), ...(state ? { state } : {}) });
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = undefined;
    };
  }, [debug, source, timeline, width]);
  useLayoutEffect(() => instanceRef.current?.setState(state ?? ""), [state]);
  return <div className="livery livery-visual" ref={hostRef} />;
}

function QualityGallery() {
  const requestedWidth = Number(new URLSearchParams(window.location.search).get("width"));
  const width = galleryWidths.find((candidate) => candidate === requestedWidth) ?? 720;
  return (
    <main className="quality-gallery">
      <header className="quality-gallery-header">
        <div><strong>Livery quality gallery</strong><span>{width}px logical width</span></div>
        <nav aria-label="Gallery width">
          {galleryWidths.map((candidate) => <a aria-current={candidate === width ? "page" : undefined} href={`?gallery=1&width=${candidate}`} key={candidate}>{candidate}</a>)}
        </nav>
      </header>
      <div className="quality-gallery-list">
        {qualityExamples.map((example) => {
          const result = render(example.source, { width });
          return (
            <section className="quality-gallery-item" key={example.id}>
              <header><strong>{example.label}</strong><span>{result.scene ? `${result.scene.elements.length} elements, ${result.scene.connectors.length} connectors` : "invalid"}</span></header>
              <div className="quality-gallery-stage" style={{ width }}>
                <LiveryVisual source={example.source} width={width} />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

declare global { interface Window { __liveryPlaygroundRoot?: Root } }
const root = (window.__liveryPlaygroundRoot ??= createRoot(document.getElementById("root")!));
const gallery = new URLSearchParams(window.location.search).has("gallery");
root.render(<StrictMode>{gallery ? <QualityGallery /> : <Playground />}</StrictMode>);
