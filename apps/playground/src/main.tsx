import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Livery } from "@livery/react";

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
          <Livery source={source} />
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
