import { compile, renderToText, type LiverySource } from "@livery/core";

export type LiveryProps = {
  source: LiverySource;
};

export function Livery({ source }: LiveryProps) {
  const sourceType = typeof source === "string" ? "dsl" : "json";
  const result = compile(source);

  if (!result.artifact) {
    return (
      <div aria-label="Invalid Livery visual" data-livery-source={sourceType} role="alert">
        <strong>Unable to compile visual</strong>
        <ul>
          {result.diagnostics.map((item, index) => (
            <li key={`${item.code}-${index}`}>{item.message}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <figure data-livery-source={sourceType}>
      <figcaption>{result.artifact.title ?? result.artifact.id}</figcaption>
      <pre>{renderToText(result.artifact)}</pre>
    </figure>
  );
}
