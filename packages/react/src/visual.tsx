import {
  mountLiveryVisual,
  type LiveryVisualInstance,
  type LiveryVisualOptions,
  type LiveryVisualRevision,
} from "@jerkeyray/web";
import { useEffect, useRef } from "react";

export type LiveryVisualProps = Omit<LiveryVisualOptions, "onDiagnostics" | "onRevision"> & {
  className?: string;
  source: string;
  compileDelay?: number;
  onRender?: (instance: LiveryVisualInstance) => void;
  onRevision?: (revision: LiveryVisualRevision) => void;
  onDiagnostics?: (diagnostics: LiveryVisualRevision["diagnostics"]) => void;
};

export function LiveryVisual({ className, compileDelay = 0, source, onDiagnostics, onRender, onRevision, ...options }: LiveryVisualProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LiveryVisualInstance | undefined>(undefined);
  const onRenderRef = useRef(onRender);
  const onRevisionRef = useRef(onRevision);
  const onDiagnosticsRef = useRef(onDiagnostics);
  onRenderRef.current = onRender;
  onRevisionRef.current = onRevision;
  onDiagnosticsRef.current = onDiagnostics;
  useEffect(() => {
    if (!ref.current) return;
    const { state: _state, ...mountOptions } = options;
    const instance = mountLiveryVisual(ref.current, source, {
      ...mountOptions,
      onRevision: (revision) => onRevisionRef.current?.(revision),
      onDiagnostics: (diagnostics) => onDiagnosticsRef.current?.(diagnostics),
    });
    instanceRef.current = instance;
    onRenderRef.current?.(instance);
    return () => { instanceRef.current = undefined; instance.destroy(); };
  }, [options.tokenOverrides, options.icons, options.resourcePolicy, options.width, options.timeline, options.debug, options.retainLastValid, options.responsive]);
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || instance.revision.source === source) return;
    const timeout = setTimeout(() => instance.update(source), Math.max(0, compileDelay));
    return () => clearTimeout(timeout);
  }, [compileDelay, source]);
  useEffect(() => instanceRef.current?.setTheme(options.theme), [options.theme]);
  useEffect(() => instanceRef.current?.setState(options.state ?? ""), [options.state]);
  return <div className={className ? `livery livery-visual ${className}` : "livery livery-visual"} ref={ref} />;
}
