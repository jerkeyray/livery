import { describe, expect, it } from "vitest";
import { isImageSourceAllowed, render } from "./index.js";

const imageFigure = (source: string) => `figure image_demo("Image") {
  art = image(src: "${source}", x: 0, y: 0, width: 80, height: 60)
  canvas(art, width: 100, height: 80)
}`;
const boardImageFigure = (source: string) => `figure image_demo("Image") {
  art = image(src: "${source}", width: 80, height: 60)
  row(art)
}`;

describe("resource policy", () => {
  it("allows bounded data images and denies remote images by default", () => {
    expect(isImageSourceAllowed("data:image/svg+xml,%3Csvg%2F%3E")).toBe(true);
    expect(isImageSourceAllowed("https://assets.example.com/image.png")).toBe(false);
    const result = render(imageFigure("https://assets.example.com/image.png"), { width: 320 });
    expect(result.svg).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("resource.image_not_allowed");
    expect(render(boardImageFigure("https://assets.example.com/image.png"), { width: 320 }).diagnostics.map(({ code }) => code)).toContain("resource.image_not_allowed");
  });

  it("allows only explicitly listed HTTPS hosts", () => {
    const policy = { allowedImageHosts: ["assets.example.com"] };
    expect(isImageSourceAllowed("https://assets.example.com/image.png", policy)).toBe(true);
    expect(isImageSourceAllowed("http://assets.example.com/image.png", policy)).toBe(false);
    expect(isImageSourceAllowed("https://evil.example/image.png", policy)).toBe(false);
    const svg = render(imageFigure("https://assets.example.com/image.png"), { width: 320, resourcePolicy: policy }).svg;
    expect(svg).toContain("<image");
    expect(render(boardImageFigure("https://assets.example.com/image.png"), { width: 320, resourcePolicy: policy }).svg).toContain("<image");
    expect(svg).not.toMatch(/<script|\son\w+=/i);
  });
});
