import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Livery } from "@livery/react";

import "@livery/react/styles.css";
import "./styles.css";

const source = `flow checkout("Checkout request") {
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
