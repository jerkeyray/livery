import { mountLiveryVisual, type LiveryVisualInstance, type LiveryVisualOptions } from "@jerkeyray/web/visual-renderer";
import { useEffect, useRef } from "react";

export type LiveryVisualProps = LiveryVisualOptions & {
  className?: string;
  source: string;
  onRender?: (instance: LiveryVisualInstance) => void;
};

export function LiveryVisual({ className, source, onRender, ...options }: LiveryVisualProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const instance = mountLiveryVisual(ref.current, source, options);
    onRender?.(instance);
    return () => instance.destroy();
  }, [source, options.theme, options.tokenOverrides, options.width, options.timeline, options.state, options.debug, onRender]);
  return <div className={className ? `livery livery-visual ${className}` : "livery livery-visual"} ref={ref} />;
}
