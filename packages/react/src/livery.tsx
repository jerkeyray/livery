import type { LiverySource } from "@livery/core";

export type LiveryProps = {
  source: LiverySource;
};

export function Livery({ source }: LiveryProps) {
  const sourceType = typeof source === "string" ? "dsl" : "json";

  return (
    <div aria-label="Livery visual" data-livery-source={sourceType} role="figure">
      <p>Livery compiler foundation</p>
    </div>
  );
}
