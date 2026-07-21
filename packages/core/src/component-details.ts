import type { VisualValue } from "./visual.js";

export type ComponentDetailRow = { text: string; bullet: boolean };

export function componentDetailRows(kind: string, props: Readonly<Record<string, VisualValue>> | undefined): ComponentDetailRow[] {
  if (!props) return [];
  const rows: ComponentDetailRow[] = [];
  appendList(rows, props.annotations, false);
  appendList(rows, props.items, kind === "lib.list" || kind === "lib.legend");
  appendRecords(rows, props.fields, "field");
  appendRecords(rows, props.methods, "method");
  for (const key of ["entry", "exit", "risk", "verification", "reference", "status"] as const) {
    if (typeof props[key] === "string") rows.push({ text: `${humanize(key)}: ${props[key]}`, bullet: false });
  }
  return rows;
}

function appendList(rows: ComponentDetailRow[], value: VisualValue | undefined, bullet: boolean) {
  if (!Array.isArray(value)) return;
  for (const item of value) if (typeof item === "string") rows.push({ text: item, bullet });
}

function appendRecords(rows: ComponentDetailRow[], value: VisualValue | undefined, fallback: string) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const marker = item.key === true ? "key " : typeof item.key === "string" ? `${item.key} ` : "";
    const visibility = typeof item.visibility === "string" ? `${item.visibility} ` : "";
    const name = typeof item.name === "string" ? item.name : fallback;
    const signature = typeof item.signature === "string" ? item.signature : "";
    const type = typeof item.type === "string" ? `: ${item.type}` : typeof item.returns === "string" ? `: ${item.returns}` : "";
    rows.push({ text: `${marker}${visibility}${name}${signature}${type}`, bullet: false });
  }
}

function isRecord(value: VisualValue): value is Readonly<Record<string, VisualValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
