// @vitest-environment happy-dom

import { act, createElement, StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LiveryChatVisual } from "./chat-visual.js";

const validSource = `figure demo("Demo") {
  api = service("API")
  timeline progress {
    state start { show(api) }
    state done { focus(api) }
  }
  row(api)
}`;

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { document.body.replaceChildren(); });

describe("LiveryChatVisual", () => {
  it("is safe to render on the server", () => {
    const html = renderToString(createElement(LiveryChatVisual, { source: validSource, streaming: false }));
    expect(html).toContain("livery-chat-visual");
    expect(html).not.toContain("<svg");
  });

  it("reveals a valid visual and keyboard timeline controls", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(LiveryChatVisual, { compileDelay: 0, source: validSource, streaming: false })));
    });
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelectorAll(".livery-chat-timeline button")).toHaveLength(2);
    const controls = host.querySelector<HTMLElement>(".livery-chat-timeline")!;
    await act(async () => controls.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" })));
    expect(host.querySelectorAll(".livery-chat-timeline button")[1]?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.unmount());
  });

  it("shows a supplied fallback only after a final invalid revision", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(LiveryChatVisual, { compileDelay: 0, fallback: createElement("span", null, "Unavailable"), source: "figure", streaming: true }));
    });
    expect(host.textContent).not.toContain("Unavailable");
    await act(async () => {
      root.render(createElement(LiveryChatVisual, { compileDelay: 0, fallback: createElement("span", null, "Unavailable"), source: "figure", streaming: false }));
    });
    expect(host.textContent).toContain("Unavailable");
    await act(async () => root.unmount());
  });

  it("hydrates and supports multiple independent visuals", async () => {
    const markup = renderToString(createElement("div", null,
      createElement(LiveryChatVisual, { source: validSource, streaming: false }),
      createElement(LiveryChatVisual, { source: validSource, streaming: false }),
    ));
    const host = document.createElement("div");
    host.innerHTML = markup;
    document.body.append(host);
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, createElement("div", null,
        createElement(LiveryChatVisual, { compileDelay: 0, source: validSource, streaming: false }),
        createElement(LiveryChatVisual, { compileDelay: 0, source: validSource, streaming: false }),
      ));
    });
    expect(host.querySelectorAll("svg")).toHaveLength(2);
    await act(async () => root!.unmount());
  });
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
