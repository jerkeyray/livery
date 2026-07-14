import { mountLiveryVisual, type LiveryVisualInstance, type LiveryVisualOptions } from "@jerkeyray/web/visual-renderer";
import { useEffect, useRef } from "react";

export type LiveryVisualProps = LiveryVisualOptions & {
  className?: string;
  source: string;
  onRender?: (instance: LiveryVisualInstance) => void;
};

export function LiveryVisual({ className, source, onRender, ...options }: LiveryVisualProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LiveryVisualInstance | undefined>(undefined);
  const onRenderRef = useRef(onRender);
  onRenderRef.current = onRender;
  useEffect(() => {
    if (!ref.current) return;
    const { state: _state, ...mountOptions } = options;
    const instance = mountLiveryVisual(ref.current, source, mountOptions);
    instanceRef.current = instance;
    onRenderRef.current?.(instance);
    return () => { instanceRef.current = undefined; instance.destroy(); };
  }, [source, options.theme, options.tokenOverrides, options.width, options.timeline, options.debug]);
  useEffect(() => instanceRef.current?.setState(options.state ?? ""), [options.state]);
  return <div className={className ? `livery livery-visual ${className}` : "livery livery-visual"} ref={ref} />;
}
