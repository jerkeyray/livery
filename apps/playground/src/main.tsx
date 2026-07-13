import { StrictMode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compileVisual } from "@jerkeyray/core";
import { LiveryVisual } from "@jerkeyray/react";
import { mountLiveryVisual, type LiveryVisualInstance } from "@jerkeyray/web";

import "@jerkeyray/web/styles.css";
import "@jerkeyray/react/styles.css";
import "./styles.css";

const initialSource = `component RequestPath(client: string, endpoint: string) {
  user = person(client)
  api = service(endpoint)

  return row(gap: md) {
    user
    api
  }
}

figure checkout("Checkout request") {
  request = RequestPath("Customer", "Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  authorize = request.right -> payment.left("authorize")
  persist = request.right -> orders.left("persist")

  row(request, payment, orders, gap: 56)

  timeline checkout {
    state request {
      show(request)
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

function Playground() {
  const [source, setSource] = useState(initialSource);
  const [renderer, setRenderer] = useState<"react" | "web">("react");
  const [viewport, setViewport] = useState<"full" | "chat">("full");
  const [debug, setDebug] = useState(false);
  const compilation = useMemo(() => compileVisual(source), [source]);
  const timeline = compilation.document?.timelines[0];
  const [state, setState] = useState<string>();
  const activeState = timeline?.states.some(({ id }) => id === state) ? state : undefined;
  const width = viewport === "chat" ? 360 : 760;

  return (
    <main>
      <header>
        <span>Livery</span>
        <h1>Visual language playground</h1>
      </header>
      <div className="workbench">
        <section className="editor-pane">
          <label htmlFor="livery-source">Source</label>
          <textarea
            aria-label="Livery source"
            id="livery-source"
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            value={source}
          />
        </section>
        <section aria-label="Preview" className="preview-pane">
          <div className="preview-controls">
            <div aria-label="Renderer" className="segmented-control" role="group">
              <button aria-pressed={renderer === "react"} onClick={() => setRenderer("react")} type="button">React</button>
              <button aria-pressed={renderer === "web"} onClick={() => setRenderer("web")} type="button">Web</button>
            </div>
            <div aria-label="Viewport" className="segmented-control" role="group">
              <button aria-pressed={viewport === "full"} onClick={() => setViewport("full")} type="button">Full</button>
              <button aria-pressed={viewport === "chat"} onClick={() => setViewport("chat")} type="button">Chat</button>
            </div>
            <label className="debug-toggle">
              <input checked={debug} onChange={(event) => setDebug(event.target.checked)} type="checkbox" />
              <span>Debug geometry</span>
            </label>
          </div>
          <div className="timeline-controls" role="group" aria-label="Timeline state">
            <button aria-pressed={!activeState} onClick={() => setState(undefined)} type="button">All</button>
            {timeline?.states.map(({ id }) => (
              <button aria-pressed={activeState === id} key={id} onClick={() => setState(id)} type="button">{id}</button>
            ))}
          </div>
          <div className={viewport === "chat" ? "preview-frame preview-frame-chat" : "preview-frame"}>
            {renderer === "react" ? (
              <LiveryVisual debug={debug} source={source} width={width} {...(activeState ? { state: activeState } : {})} {...(timeline ? { timeline: timeline.id } : {})} />
            ) : (
              <WebPreview debug={debug} source={source} width={width} {...(activeState ? { state: activeState } : {})} {...(timeline ? { timeline: timeline.id } : {})} />
            )}
          </div>
        </section>
      </div>
    </main>
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
