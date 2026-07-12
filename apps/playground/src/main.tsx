import { StrictMode, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createLayoutPolicyAdapter,
  fastFlowLayoutAdapter,
  type ArtifactElement,
  type LayoutAdapter,
} from "@jerkeyray/core";
import { Livery } from "@jerkeyray/react";
import { mountLivery, type LiveryWebInstance } from "@jerkeyray/web";
import elkWorkerUrl from "@jerkeyray/layout-elk/worker?url";

import "@jerkeyray/web/styles.css";
import "@jerkeyray/react/styles.css";
import "./styles.css";

const initialSource = `flow checkout("Checkout request") {
  customer = actor("Customer")
  api = service("Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  submission = customer -> api("submit order")
  authorization = api -> payment("authorize")
  approval = payment -> api("approved", tone: success)
  persistence = api -> orders("persist")

  story {
    reveal(customer, api)
    trace(submission)
    reveal(payment)
    trace(authorization)
    indicate(approval)
    reveal(orders)
    trace(persistence)
  }
}`;

let elkAdapterPromise: Promise<LayoutAdapter> | undefined;
const lazyElkLayoutAdapter: LayoutAdapter = {
  id: "livery.lazy-elk",
  async layout(request) {
    elkAdapterPromise ??= import("@jerkeyray/layout-elk").then(({ createElkWorkerLayoutAdapter }) =>
      createElkWorkerLayoutAdapter({ workerUrl: elkWorkerUrl }),
    );
    return (await elkAdapterPromise).layout(request);
  },
};
const automaticLayoutAdapter = createLayoutPolicyAdapter({ advanced: lazyElkLayoutAdapter });

function Playground() {
  const [source, setSource] = useState(initialSource);
  const [renderer, setRenderer] = useState<"react" | "web">("react");
  const [layoutMode, setLayoutMode] = useState<"auto" | "fast">("auto");
  const [selection, setSelection] = useState<ArtifactElement>();
  const layoutAdapter = layoutMode === "auto" ? automaticLayoutAdapter : fastFlowLayoutAdapter;

  return (
    <main>
      <header>
        <span>Livery</span>
        <h1>Compiler playground</h1>
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
              <button aria-pressed={renderer === "react"} onClick={() => setRenderer("react")} type="button">
                React
              </button>
              <button aria-pressed={renderer === "web"} onClick={() => setRenderer("web")} type="button">
                Web
              </button>
            </div>
            <div aria-label="Layout" className="segmented-control" role="group">
              <button aria-pressed={layoutMode === "auto"} onClick={() => setLayoutMode("auto")} type="button">
                Auto
              </button>
              <button aria-pressed={layoutMode === "fast"} onClick={() => setLayoutMode("fast")} type="button">
                Fast
              </button>
            </div>
          </div>
          <output className="selection-status">
            {selection ? `Selected: ${selection.type} ${selection.value.id}` : "No selection"}
          </output>
          {renderer === "react" ? (
            <Livery layoutAdapter={layoutAdapter} onActivate={setSelection} source={source} />
          ) : (
            <WebPreview layoutAdapter={layoutAdapter} onActivate={setSelection} source={source} />
          )}
        </section>
      </div>
    </main>
  );
}

function WebPreview({
  layoutAdapter,
  onActivate,
  source,
}: {
  layoutAdapter: LayoutAdapter;
  onActivate: (element: ArtifactElement) => void;
  source: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LiveryWebInstance>(undefined);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    instanceRef.current = mountLivery(host, source, { layoutAdapter, onActivate });
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = undefined;
    };
  }, [layoutAdapter, onActivate]);

  useLayoutEffect(() => {
    instanceRef.current?.update(source);
  }, [source]);

  return <div ref={hostRef} />;
}

declare global {
  interface Window {
    __liveryPlaygroundRoot?: Root;
  }
}

const root = (window.__liveryPlaygroundRoot ??= createRoot(document.getElementById("root")!));

root.render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
