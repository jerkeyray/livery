import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Livery } from "@livery/react";

import "./styles.css";

const source = `flow checkout "Checkout request"
  customer -> api "submit order"
  api -> payment "authorize"
  payment -> api "approved" tone=success
  api -> orders "persist"`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <header>
        <span>Livery</span>
        <h1>Compiler playground</h1>
      </header>
      <Livery source={source} />
    </main>
  </StrictMode>,
);
