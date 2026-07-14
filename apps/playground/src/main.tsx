import { StrictMode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { render } from "@jerkeyray/core";
import { LiveryVisual } from "@jerkeyray/react";
import { mountLiveryVisual, type LiveryVisualInstance } from "@jerkeyray/web";
import { Bug, Check, Code2, Eye, TriangleAlert } from "lucide-react";

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
import dataTransformSource from "../../../fixtures/visual/data-pipeline-canvas.livery?raw";
import mechanismSource from "../../../fixtures/visual/mechanism.livery?raw";
import protocolSource from "../../../fixtures/visual/protocol.livery?raw";
import scientificSource from "../../../fixtures/visual/scientific-motion.livery?raw";

const initialSource = `figure checkout("Checkout request") {
  customer = person("Customer")
  api = service("Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  submit = customer.right -> api.left("submit order")
  authorize = api.right -> payment.left("authorize")
  persist = api.right -> orders.left("persist")

  grid(customer, api, payment, orders, columns: 3, gap: 56)

  timeline checkout {
    state request {
      show(customer, api)
      trace(submit)
    }
    state authorization {
      show(payment)
      trace(authorize)
      focus(payment)
    }
    state complete {
      show(orders)
      trace(persist)
      set(persist, tone: success)
    }
    transition request -> authorization(duration: normal)
    transition authorization -> complete(duration: normal)
  }
}`;

const examples = [
  { id: "checkout", label: "Checkout flow", file: "checkout.livery", source: initialSource },
  { id: "mechanism", label: "Valve mechanism", file: "mechanism.livery", source: mechanismSource },
  { id: "data-transform", label: "Data transformation", file: "data-transform.livery", source: dataTransformSource },
  { id: "scientific", label: "Orbital motion", file: "orbital-motion.livery", source: scientificSource },
  { id: "agent-trace", label: "Agent tool trace", file: "agent-trace.livery", source: agentTraceSource },
  { id: "protocol", label: "Request protocol", file: "protocol.livery", source: protocolSource },
] as const;

function Playground() {
  const [source, setSource] = useState(initialSource);
  const [exampleId, setExampleId] = useState<string>(examples[0].id);
  const [renderer, setRenderer] = useState<"react" | "web">("react");
  const [viewport, setViewport] = useState<"full" | "chat">("full");
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("preview");
  const [debug, setDebug] = useState(false);
  const width = viewport === "chat" ? 360 : 760;
  const compilation = useMemo(() => render(source, { width }), [source, width]);
  const timeline = compilation.document?.timelines[0];
  const [state, setState] = useState<string>();
  const activeState = timeline?.states.some(({ id }) => id === state) ? state : undefined;
  const selectedExample = examples.find(({ id }) => id === exampleId);

  const errors = compilation.diagnostics.filter(({ severity }) => severity === "error");
  return (
    <div className="studio">
      <header className="app-bar">
        <div className="brand"><span className="brand-mark">L</span><strong>Livery</strong><span>Playground</span></div>
        <div className={errors.length ? "compile-status compile-status-error" : "compile-status"}>
          {errors.length ? <TriangleAlert aria-hidden size={14} /> : <Check aria-hidden size={14} />}
          <span>{errors.length ? `${errors.length} ${errors.length === 1 ? "error" : "errors"}` : "Ready"}</span>
        </div>
      </header>
      <nav aria-label="Workspace view" className="mobile-tabs">
        <button aria-selected={mobilePane === "source"} onClick={() => setMobilePane("source")} role="tab" type="button"><Code2 aria-hidden size={15} />Source</button>
        <button aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")} role="tab" type="button"><Eye aria-hidden size={15} />Preview</button>
      </nav>
      <main className="workbench">
        <section className={`workspace-pane editor-pane${mobilePane === "source" ? " mobile-active" : ""}`}>
          <div className="pane-header">
            <div className="pane-title"><Code2 aria-hidden size={15} /><strong>Source</strong><span>{selectedExample?.file ?? "custom.livery"}</span></div>
            <div className="editor-header-actions">
              <select
                aria-label="Example figure"
                onChange={(event) => {
                  const example = examples.find(({ id }) => id === event.target.value);
                  if (!example) return;
                  setExampleId(example.id);
                  setSource(example.source);
                  setState(undefined);
                }}
                value={exampleId}
              >
                {exampleId === "custom" && <option value="custom">Custom</option>}
                {examples.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </select>
              <span className="pane-meta">{source.split("\n").length} lines</span>
            </div>
          </div>
          <LiveryEditor diagnostics={compilation.diagnostics} onChange={(nextSource) => { setSource(nextSource); setExampleId("custom"); }} source={source} />
          {compilation.diagnostics.length > 0 && (
            <div className="diagnostics" role="status">
              {compilation.diagnostics.slice(0, 3).map((diagnostic) => <div key={`${diagnostic.code}:${diagnostic.span?.start.offset ?? 0}`}><TriangleAlert aria-hidden size={13} /><span>{diagnostic.message}</span></div>)}
            </div>
          )}
        </section>
        <section aria-label="Preview" className={`workspace-pane preview-pane${mobilePane === "preview" ? " mobile-active" : ""}`}>
          <div className="pane-header preview-header">
            <div className="pane-title"><Eye aria-hidden size={15} /><strong>Preview</strong><span>{width}px</span></div>
            <div className="preview-controls">
              <div aria-label="Renderer" className="segmented-control" role="group">
                <button aria-pressed={renderer === "react"} onClick={() => setRenderer("react")} type="button">React</button>
                <button aria-pressed={renderer === "web"} onClick={() => setRenderer("web")} type="button">Web</button>
              </div>
              <div aria-label="Viewport" className="segmented-control" role="group">
                <button aria-pressed={viewport === "full"} onClick={() => setViewport("full")} type="button">Full</button>
                <button aria-pressed={viewport === "chat"} onClick={() => setViewport("chat")} type="button">Chat</button>
              </div>
              <label className="debug-toggle" title="Show solved geometry">
                <Bug aria-hidden size={14} />
                <span>Debug</span>
                <input checked={debug} onChange={(event) => setDebug(event.target.checked)} type="checkbox" />
              </label>
            </div>
          </div>
          <div className="timeline-bar">
            <span>Timeline</span>
            <div className="timeline-controls" role="group" aria-label="Timeline state">
              <button aria-pressed={!activeState} onClick={() => setState(undefined)} type="button">All</button>
              {timeline?.states.map(({ id }, index) => (
                <button aria-pressed={activeState === id} key={id} onClick={() => setState(id)} type="button"><span aria-hidden>{index + 1}</span>{id}</button>
              ))}
            </div>
          </div>
          <div className="preview-stage">
            <div className={viewport === "chat" ? "preview-frame preview-frame-chat" : "preview-frame"}>
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

declare global { interface Window { __liveryPlaygroundRoot?: Root } }
const root = (window.__liveryPlaygroundRoot ??= createRoot(document.getElementById("root")!));
root.render(<StrictMode><Playground /></StrictMode>);
