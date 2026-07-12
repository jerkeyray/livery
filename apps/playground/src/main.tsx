import { StrictMode, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Livery } from "@livery/react";
import { mountLivery, type LiveryWebInstance } from "@livery/web";

import "@livery/web/styles.css";
import "@livery/react/styles.css";
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

function Playground() {
  const [source, setSource] = useState(initialSource);
  const [renderer, setRenderer] = useState<"react" | "web">("react");

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
          <div aria-label="Renderer" className="renderer-switch" role="group">
            <button aria-pressed={renderer === "react"} onClick={() => setRenderer("react")} type="button">
              React
            </button>
            <button aria-pressed={renderer === "web"} onClick={() => setRenderer("web")} type="button">
              Web
            </button>
          </div>
          {renderer === "react" ? <Livery source={source} /> : <WebPreview source={source} />}
        </section>
      </div>
    </main>
  );
}

function WebPreview({ source }: { source: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LiveryWebInstance>(undefined);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (instanceRef.current) instanceRef.current.update(source);
    else instanceRef.current = mountLivery(host, source);
  }, [source]);

  useLayoutEffect(
    () => () => {
      instanceRef.current?.destroy();
      instanceRef.current = undefined;
    },
    [],
  );

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
