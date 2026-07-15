import type { LiveryVisualRevision } from "@jerkeyray/web";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { LiveryVisual, type LiveryVisualProps } from "./visual.js";

export type LiveryTimelineControls = "auto" | "always" | "hidden";

export type LiveryChatVisualProps = Omit<
  LiveryVisualProps,
  "compileDelay" | "onRevision" | "retainLastValid" | "responsive" | "state"
> & {
  streaming: boolean;
  fallback?: ReactNode;
  compileDelay?: number;
  state?: string;
  onStateChange?: (stateId: string | undefined) => void;
  onRevision?: (revision: LiveryVisualRevision) => void;
  timelineControls?: LiveryTimelineControls;
};

export function LiveryChatVisual({
  className,
  compileDelay = 80,
  fallback,
  onRevision,
  onStateChange,
  state: controlledState,
  streaming,
  timeline,
  timelineControls = "auto",
  ...visualProps
}: LiveryChatVisualProps) {
  const [revision, setRevision] = useState<LiveryVisualRevision>();
  const [internalState, setInternalState] = useState<string>();
  const selectedTimeline = revision?.document?.timelines.find(({ id }) => id === timeline)
    ?? revision?.document?.timelines[0];
  const states = selectedTimeline?.states ?? [];
  const state = controlledState ?? internalState;
  const selectedState = states.some(({ id }) => id === state) ? state : undefined;
  const hasValidScene = Boolean(revision?.document && revision.scene);
  const finalFailure = !streaming && (revision?.status === "invalid" || revision?.status === "retained");
  const showVisual = hasValidScene && !finalFailure;
  const showControls = showVisual && states.length > 0 && timelineControls !== "hidden"
    && (timelineControls === "always" || states.length > 1);
  const rootClassName = useMemo(
    () => ["livery-chat-visual", className].filter(Boolean).join(" "),
    [className],
  );

  const selectState = (next: string | undefined) => {
    if (controlledState === undefined) setInternalState(next);
    onStateChange?.(next);
  };

  const handleControlKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!states.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, states.findIndex(({ id }) => id === selectedState));
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? states.length - 1
        : event.key === "ArrowLeft" ? Math.max(0, currentIndex - 1)
          : Math.min(states.length - 1, currentIndex + 1);
    const next = states[nextIndex]?.id;
    selectState(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus();
  };

  return (
    <section className={rootClassName} data-livery-status={revision?.status ?? "empty"}>
      <div aria-hidden={!showVisual} className="livery-chat-visual-stage" hidden={!showVisual}>
        <LiveryVisual
          {...visualProps}
          className="livery-chat-visual-renderer"
          compileDelay={compileDelay}
          onRevision={(next) => { setRevision(next); onRevision?.(next); }}
          retainLastValid
          responsive
          {...(selectedState ? { state: selectedState } : {})}
          {...(timeline ? { timeline } : {})}
        />
      </div>
      {showControls && (
        <div aria-label="Visual timeline" className="livery-chat-timeline" onKeyDown={handleControlKey} role="group">
          {states.map(({ id }, index) => (
            <button aria-pressed={selectedState === id} key={id} onClick={() => selectState(id)} type="button">
              <span aria-hidden>{index + 1}</span>{id}
            </button>
          ))}
        </div>
      )}
      <span aria-live="polite" className="livery-chat-announcement">
        {selectedState ? `Visual state ${selectedState}` : ""}
      </span>
      {finalFailure ? fallback ?? null : null}
    </section>
  );
}
