import type { StoryStep } from "@jerkeyray/core";

export function animateStoryStep(container: HTMLElement, step: StoryStep) {
  const animations: Animation[] = [];

  for (const target of step.targets) {
    const element = elementForTarget(container, target);
    if (!element) continue;

    if ((step.action === "reveal" || step.action === "enter") && target.type === "entity") {
      animations.push(
        element.animate(
          [
            { opacity: 0, transform: "translateY(6px) scale(0.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        ),
      );
      continue;
    }

    const path = target.type === "relationship" ? element.querySelector<SVGPathElement>(":scope > path") : undefined;
    if (step.action === "trace" && path) {
      const length = path.getTotalLength();
      animations.push(
        path.animate(
          [
            { strokeDasharray: `${length}`, strokeDashoffset: length },
            { strokeDasharray: `${length}`, strokeDashoffset: 0 },
          ],
          { duration: 420, easing: "ease-out" },
        ),
      );
      continue;
    }

    if (step.action === "focus") {
      animations.push(
        element.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.08)" }], {
          duration: 220,
          easing: "ease-out",
        }),
      );
    }

    if (step.action === "indicate") {
      animations.push(
        (path ?? element).animate(
          [{ opacity: 0.45 }, { opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }],
          { duration: 360, easing: "ease-out" },
        ),
      );
    }
  }

  return animations;
}

export function prefersReducedMotion(container: HTMLElement) {
  return container.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
}

function elementForTarget(container: HTMLElement, target: StoryStep["targets"][number]) {
  const selector = target.type === "entity" ? ".livery-node" : ".livery-edge";
  return [...container.querySelectorAll<HTMLElement | SVGGElement>(selector)].find(
    (element) => element.dataset.liveryId === target.id,
  );
}
