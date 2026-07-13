import type { LiveryArtifact } from "./artifact.js";
import { compile as legacyCompile } from "./compiler.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { instantiateStandardComponent, standardLibrary, type StandardComponentName } from "./stdlib.js";
import type {
  AnchorName,
  ComponentParameter,
  Connector,
  LayoutKind,
  Timeline,
  TimelineOperation,
  VisualConstraint,
  VisualDocument,
  VisualNode,
  VisualValue,
} from "./visual.js";

export type VisualCompileResult = {
  document?: VisualDocument;
  diagnostics: Diagnostic[];
};

type Call = { name: string; positional: VisualValue[]; named: Record<string, VisualValue> };
type Binding = { id: string; call: Call };
type LayoutDeclaration = { kind: LayoutKind; named: Record<string, VisualValue>; children: string[] };
type ComponentSource = { name: string; parameters: ComponentParameter[]; bindings: Binding[]; returned?: LayoutDeclaration };
type ExpansionContext = { components: Map<string, ComponentSource>; diagnostics: Diagnostic[]; count: number; connectors: Connector[] };

const MAX_COMPONENT_DEPTH = 16;
const MAX_EXPANDED_NODES = 512;

export function compileVisual(source: string): VisualCompileResult {
  const diagnostics: Diagnostic[] = [];
  const lines = meaningfulLines(source);
  const components = new Map<string, ComponentSource>();
  let figure: { id: string; title?: string; lines: string[] } | undefined;

  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.text.startsWith("component ")) {
      const block = collectBlock(lines, index, diagnostics);
      index = block.next;
      const parsed = parseComponent(line.text, block.body, diagnostics);
      if (parsed) {
        if (components.has(parsed.name)) diagnostics.push(diagnostic("semantic.duplicate_component", `Component ${parsed.name} is already defined.`));
        else components.set(parsed.name, parsed);
      }
      continue;
    }
    if (line.text.startsWith("figure ")) {
      const block = collectBlock(lines, index, diagnostics);
      index = block.next;
      const match = /^figure\s+([A-Za-z_][\w-]*)(?:\("([^"]*)"\))?\s*\{$/.exec(line.text);
      if (!match) diagnostics.push(diagnostic("syntax.invalid_figure", "Expected figure id(\"title\") {.", line.span));
      else if (figure) diagnostics.push(diagnostic("syntax.multiple_documents", "A source file may contain only one figure.", line.span));
      else figure = { id: match[1]!, ...(match[2] ? { title: match[2] } : {}), lines: block.body.map(({ text }) => text) };
      continue;
    }
    diagnostics.push(diagnostic("syntax.unexpected_statement", `Unexpected top-level statement ${line.text}.`, line.span));
    index += 1;
  }

  if (!figure) diagnostics.push(diagnostic("semantic.missing_figure", "Document must contain a figure declaration."));
  if (!figure || diagnostics.some(({ severity }) => severity === "error")) return { diagnostics };

  const context: ExpansionContext = { components, diagnostics, count: 0, connectors: [] };
  const document = compileFigure(figure, context);
  return diagnostics.some(({ severity }) => severity === "error") ? { diagnostics } : { document, diagnostics };
}

export function migrateLegacyArtifact(artifact: LiveryArtifact): VisualDocument {
  const relationshipIds = new Map(artifact.relationships.map((relationship, index) => [relationship.id, safeIdentifier(relationship.id, `connection_${index + 1}`)]));
  const children = artifact.entities.map((entity) => instantiateStandardComponent(
    legacyComponent(entity.role),
    entity.id,
    { label: entity.label, ...(entity.tone ? { tone: entity.tone } : {}) },
  ));
  return {
    type: "livery.visual",
    version: "0.2",
    id: artifact.id,
    ...(artifact.title ? { title: artifact.title } : {}),
    root: { id: "root", kind: "group", layout: { kind: "row", gap: "$space.lg" }, children },
    connectors: artifact.relationships.map((relationship) => ({
      id: relationshipIds.get(relationship.id)!,
      from: { node: relationship.from, anchor: "right" },
      to: { node: relationship.to, anchor: "left" },
      ...(relationship.label ? { label: relationship.label } : {}),
      ...(relationship.tone ? { tone: relationship.tone } : {}),
    })),
    constraints: [],
    timelines: artifact.story.length === 0 ? [] : [{
      id: "legacy",
      states: artifact.story.map((step, index) => ({
        id: `step_${index + 1}`,
        operations: [{
          action: legacyAction(step.action),
          targets: step.targets.map((target) => target.type === "relationship" ? relationshipIds.get(target.id) ?? target.id : target.id),
        }],
      })),
      transitions: artifact.story.slice(1).map((_, index) => ({ from: `step_${index + 1}`, to: `step_${index + 2}` })),
    }],
  };
}

export function formatVisualDocument(document: VisualDocument) {
  const lines = [`figure ${document.id}${document.title ? `(\"${escapeString(document.title)}\")` : ""} {`];
  for (const node of document.root.children ?? []) {
    const name = node.kind.startsWith("lib.") ? node.kind : "box";
    const properties = [`label: \"${escapeString(node.label ?? node.id)}\"`, ...(node.variant ? [`variant: ${node.variant}`] : []), ...(node.tone && node.tone !== "neutral" ? [`tone: ${node.tone}`] : [])];
    lines.push(`  ${node.id} = ${name}(${properties.join(", ")})`);
  }
  if (document.connectors.length) lines.push("");
  for (const connector of document.connectors) {
    const from = `${connector.from.node}.${connector.from.anchor ?? "right"}`;
    const to = `${connector.to.node}.${connector.to.anchor ?? "left"}`;
    const properties = [...(connector.label ? [`label: \"${escapeString(connector.label)}\"`] : []), ...(connector.tone && connector.tone !== "neutral" ? [`tone: ${connector.tone}`] : [])];
    lines.push(`  ${connector.id} = connect(${from}, ${to}${properties.length ? `, ${properties.join(", ")}` : ""})`);
  }
  lines.push("", `  ${document.root.layout?.kind ?? "row"}${document.root.layout?.gap ? `(gap: ${formatValue(document.root.layout.gap)})` : ""} {`);
  for (const node of document.root.children ?? []) lines.push(`    ${node.id}`);
  lines.push("  }");
  for (const constraint of document.constraints) lines.push(`  ${formatConstraint(constraint)}`);
  for (const timeline of document.timelines) {
    lines.push("", `  timeline ${timeline.id} {`);
    for (const state of timeline.states) {
      lines.push(`    state ${state.id} {`);
      for (const operation of state.operations) lines.push(`      ${formatOperation(operation)}`);
      lines.push("    }");
    }
    for (const transition of timeline.transitions) lines.push(`    transition ${transition.from} -> ${transition.to}${transition.duration ? `(duration: ${transition.duration})` : ""}`);
    lines.push("  }");
  }
  lines.push("}");
  return lines.join("\n");
}

export function migrateLegacySource(source: string) {
  const { compile } = requireLegacyCompiler();
  const result = compile(source);
  const diagnostics = result.artifact
    ? [...result.diagnostics, diagnostic("compat.legacy_source", "Legacy flow source was translated to the programmable visual language.", undefined, "warning")]
    : result.diagnostics;
  return result.artifact ? { source: formatVisualDocument(migrateLegacyArtifact(result.artifact)), diagnostics } : { diagnostics };
}

function compileFigure(
  figure: { id: string; title?: string; lines: string[] },
  context: ExpansionContext,
): VisualDocument {
  const bindings: Binding[] = [];
  const connectors = context.connectors;
  const timelines: Timeline[] = [];
  const constraints: VisualConstraint[] = [];
  let rootLayout: LayoutDeclaration | undefined;

  for (let index = 0; index < figure.lines.length;) {
    const line = figure.lines[index]!;
    const anonymousConnector = parseArrow(line);
    if (anonymousConnector) {
      const id = `${String(anonymousConnector.positional[0]).replace(".", "-")}--${String(anonymousConnector.positional[1]).replace(".", "-")}`;
      connectors.push(connectorFromBinding({ id, call: anonymousConnector }, context.diagnostics));
      index += 1;
      continue;
    }
    if (/^(align|distribute|inside|near)\(.*\)$/.test(line)) {
      const constraint = parseConstraint(line, context.diagnostics);
      if (constraint) constraints.push(constraint);
      index += 1;
      continue;
    }
    if (/^(row|column|stack|grid|overlay|canvas)\(.*\)$/.test(line)) {
      rootLayout = parseLayoutCall(line, context.diagnostics);
      index += 1;
      continue;
    }
    if (/^(row|column|stack|grid|overlay|canvas)\b/.test(line)) {
      const block = collectStringBlock(figure.lines, index, context.diagnostics);
      rootLayout = parseLayout(line, block.body, context.diagnostics);
      index = block.next;
      continue;
    }
    if (line.startsWith("timeline ")) {
      const block = collectStringBlock(figure.lines, index, context.diagnostics);
      const timeline = parseTimeline(line, block.body, context.diagnostics);
      if (timeline) timelines.push(timeline);
      index = block.next;
      continue;
    }
    const binding = parseBinding(line, context.diagnostics);
    if (binding?.call.name === "connect") connectors.push(connectorFromBinding(binding, context.diagnostics));
    else if (binding) bindings.push(binding);
    index += 1;
  }

  const nodes = new Map<string, VisualNode>();
  for (const binding of bindings) {
    const node = expandBinding(binding, {}, context, 0);
    if (node) nodes.set(binding.id, node);
  }
  const knownNodeIds = new Set([...nodes.values()].flatMap(flatNodeIds));
  for (const connector of connectors) {
    for (const endpoint of [connector.from.node, connector.to.node]) {
      if (!knownNodeIds.has(endpoint)) context.diagnostics.push(diagnostic("semantic.unknown_anchor_target", `Connector ${connector.id} references unknown node ${endpoint}.`));
    }
  }
  for (const constraint of constraints) {
    for (const id of constraintTargets(constraint)) {
      if (!knownNodeIds.has(id)) context.diagnostics.push(diagnostic("semantic.unknown_constraint_target", `Constraint ${constraint.kind} references unknown node ${id}.`));
    }
  }
  const children = rootLayout
    ? rootLayout.children.flatMap((id) => nodes.get(id) ?? (context.diagnostics.push(diagnostic("semantic.unknown_layout_child", `Layout references unknown node ${id}.`)), []))
    : [...nodes.values()];
  const root: VisualNode = {
    id: "root",
    kind: "group",
    layout: rootLayout ? { kind: rootLayout.kind, ...rootLayout.named } : { kind: "row", gap: "$space.lg" },
    children,
  };
  return { type: "livery.visual", version: "0.2", id: figure.id, ...(figure.title ? { title: figure.title } : {}), root, connectors, constraints, timelines };
}

function flatNodeIds(node: VisualNode): string[] {
  return [node.id, ...(node.children?.flatMap(flatNodeIds) ?? [])];
}

function constraintTargets(constraint: VisualConstraint) {
  if (constraint.kind === "align" || constraint.kind === "distribute") return constraint.targets;
  if (constraint.kind === "inside") return [constraint.child, constraint.container];
  return [constraint.first, constraint.second];
}

function expandBinding(
  binding: Binding,
  values: Record<string, VisualValue>,
  context: ExpansionContext,
  depth: number,
): VisualNode | undefined {
  context.count += 1;
  if (context.count > MAX_EXPANDED_NODES) {
    context.diagnostics.push(diagnostic("resource.max_expanded_nodes", `Expanded visual exceeds ${MAX_EXPANDED_NODES} nodes.`));
    return undefined;
  }
  if (depth > MAX_COMPONENT_DEPTH) {
    context.diagnostics.push(diagnostic("resource.max_component_depth", `Component expansion exceeds depth ${MAX_COMPONENT_DEPTH}.`));
    return undefined;
  }
  const call = substituteCall(binding.call, values);
  if (call.name.startsWith("lib.") || call.name in standardLibrary) {
    const name = (call.name.startsWith("lib.") ? call.name.slice(4) : call.name) as StandardComponentName;
    if (!(name in standardLibrary)) {
      context.diagnostics.push(diagnostic("semantic.unknown_library_component", `Unknown library component ${call.name}.`));
      return undefined;
    }
    return instantiateStandardComponent(name, binding.id, { ...(typeof call.positional[0] === "string" ? { label: call.positional[0] } : {}), ...call.named });
  }
  if (["text", "box", "circle", "line", "path", "image", "icon", "group", "repeat"].includes(call.name)) {
    const styleKeys = new Set(["fill", "stroke", "strokeWidth", "radius", "opacity", "color", "fontSize", "fontWeight"]);
    const style = Object.fromEntries(Object.entries(call.named).filter(([key]) => styleKeys.has(key)));
    const props = Object.fromEntries(Object.entries(call.named).filter(([key]) => !styleKeys.has(key)));
    return { id: binding.id, kind: call.name as VisualNode["kind"], ...(typeof call.positional[0] === "string" ? { label: call.positional[0] } : {}), ...(Object.keys(style).length ? { style } : {}), ...(Object.keys(props).length ? { props } : {}) };
  }
  const definition = context.components.get(call.name);
  if (!definition) {
    context.diagnostics.push(diagnostic("semantic.unknown_component", `Unknown component ${call.name}.`));
    return undefined;
  }
  const args: Record<string, VisualValue> = {};
  definition.parameters.forEach((parameter, index) => {
    const value = call.named[parameter.name] ?? call.positional[index] ?? parameter.default;
    if (value === undefined && parameter.required) context.diagnostics.push(diagnostic("semantic.missing_component_argument", `Component ${definition.name} requires ${parameter.name}.`));
    else if (value !== undefined) args[parameter.name] = value;
  });
  const children = definition.bindings.flatMap((child) => {
    if (child.call.name === "connect") {
      const connector = connectorFromBinding(child, context.diagnostics);
      context.connectors.push({
        ...connector,
        id: `${binding.id}.${connector.id}`,
        from: { ...connector.from, node: `${binding.id}.${connector.from.node}` },
        to: { ...connector.to, node: `${binding.id}.${connector.to.node}` },
      });
      return [];
    }
    const expanded = expandBinding({ ...child, id: `${binding.id}.${child.id}` }, args, context, depth + 1);
    return expanded ? [prefixLocalReferences(expanded, binding.id, new Set(definition.bindings.map(({ id }) => id)))] : [];
  });
  const returnedValues = definition.returned ? Object.fromEntries(Object.entries(definition.returned.named).map(([key, value]) => [key, substituteValue(value, args)])) : undefined;
  return {
    id: binding.id,
    kind: definition.returned?.kind === "canvas" ? "canvas" : `component.${definition.name}`,
    layout: definition.returned ? { kind: definition.returned.kind, ...returnedValues } : { kind: "row" },
    ...(definition.returned?.kind === "canvas" && returnedValues ? { props: returnedValues } : {}),
    children,
    anchors: ["top", "right", "bottom", "left", "center"],
  };
}

function prefixLocalReferences(node: VisualNode, instanceId: string, localIds: Set<string>): VisualNode {
  const props = node.props ? Object.fromEntries(Object.entries(node.props).map(([key, value]) => [key, (key === "clip" || key === "mask") && typeof value === "string" && localIds.has(value) ? `${instanceId}.${value}` : value])) : undefined;
  return { ...node, ...(props ? { props } : {}), ...(node.children ? { children: node.children.map((child) => prefixLocalReferences(child, instanceId, localIds)) } : {}) };
}

function parseComponent(header: string, body: Array<{ text: string }>, diagnostics: Diagnostic[]) {
  const match = /^component\s+([A-Za-z_][\w-]*)\((.*)\)\s*\{$/.exec(header);
  if (!match) {
    diagnostics.push(diagnostic("syntax.invalid_component", "Expected component Name(parameters) {."));
    return undefined;
  }
  const parameters = splitArguments(match[2]!).map((argument) => {
    const parameter = /^([A-Za-z_]\w*)\s*:\s*(string|number|boolean|tone)(?:\s*=\s*(.+))?$/.exec(argument);
    if (!parameter) {
      diagnostics.push(diagnostic("syntax.invalid_component_parameter", `Invalid component parameter ${argument}.`));
      return undefined;
    }
    return { name: parameter[1]!, type: parameter[2] as ComponentParameter["type"], required: !parameter[3], ...(parameter[3] ? { default: parseValue(parameter[3]) } : {}) };
  }).filter((value): value is ComponentParameter => Boolean(value));
  const bindings: Binding[] = [];
  let returned: LayoutDeclaration | undefined;
  for (let index = 0; index < body.length;) {
    const line = body[index]!.text;
    if (line.startsWith("return ")) {
      const block = collectObjectBlock(body, index, diagnostics);
      returned = parseLayout(line.slice(7), block.body.map(({ text }) => text), diagnostics);
      index = block.next;
    } else {
      const binding = parseBinding(line, diagnostics);
      if (binding) bindings.push(binding);
      index += 1;
    }
  }
  return { name: match[1]!, parameters, bindings, ...(returned ? { returned } : {}) };
}

function parseBinding(line: string, diagnostics: Diagnostic[]): Binding | undefined {
  const match = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line);
  if (!match) {
    diagnostics.push(diagnostic("syntax.invalid_binding", `Expected a named binding, received ${line}.`));
    return undefined;
  }
  const arrow = parseArrow(match[2]!);
  const call = arrow
    ? arrow
    : parseCall(match[2]!, diagnostics);
  return call ? { id: match[1]!, call } : undefined;
}

function parseArrow(source: string): Call | undefined {
  const arrow = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*->\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)(?:\("([^"]*)"\))?$/.exec(source);
  return arrow ? { name: "connect", positional: [arrow[1]!, arrow[2]!], named: { ...(arrow[3] ? { label: arrow[3] } : {}) } } : undefined;
}

function parseCall(source: string, diagnostics: Diagnostic[]): Call | undefined {
  const match = /^([A-Za-z_][\w.-]*)\((.*)\)$/.exec(source.trim());
  if (!match) {
    diagnostics.push(diagnostic("syntax.invalid_call", `Expected a function call, received ${source}.`));
    return undefined;
  }
  const positional: VisualValue[] = [];
  const named: Record<string, VisualValue> = {};
  for (const argument of splitArguments(match[2]!)) {
    const property = /^([A-Za-z_]\w*)\s*:\s*(.+)$/.exec(argument);
    if (property) named[property[1]!] = parseValue(property[2]!);
    else positional.push(parseValue(argument));
  }
  return { name: match[1]!, positional, named };
}

function parseLayout(header: string, body: string[], diagnostics: Diagnostic[]): LayoutDeclaration | undefined {
  const match = /^(row|column|stack|grid|overlay|canvas)(?:\((.*)\))?\s*\{$/.exec(header.trim());
  if (!match) {
    diagnostics.push(diagnostic("syntax.invalid_layout", `Invalid layout declaration ${header}.`));
    return undefined;
  }
  const named = parseCall(`${match[1]}(${match[2] ?? ""})`, diagnostics)?.named ?? {};
  return { kind: match[1] as LayoutKind, named, children: body.filter((line) => /^[A-Za-z_]\w*$/.test(line)) };
}

function parseLayoutCall(source: string, diagnostics: Diagnostic[]): LayoutDeclaration | undefined {
  const call = parseCall(source, diagnostics);
  if (!call || !["row", "column", "stack", "grid", "overlay", "canvas"].includes(call.name)) return undefined;
  return { kind: call.name as LayoutKind, named: call.named, children: call.positional.map(String) };
}

function parseConstraint(source: string, diagnostics: Diagnostic[]): VisualConstraint | undefined {
  const call = parseCall(source, diagnostics);
  if (!call) return undefined;
  const targets = call.positional.map(String);
  if (call.name === "align" && targets.length >= 2) return { kind: "align", targets, axis: call.named.axis === "y" ? "y" : "x", ...(typeof call.named.edge === "string" ? { edge: call.named.edge as "start" } : {}) };
  if (call.name === "distribute" && targets.length >= 3) return { kind: "distribute", targets, axis: call.named.axis === "y" ? "y" : "x", ...(call.named.gap !== undefined ? { gap: call.named.gap } : {}) };
  if (call.name === "inside" && targets.length === 2) return { kind: "inside", child: targets[0]!, container: targets[1]!, ...(call.named.padding !== undefined ? { padding: call.named.padding } : {}) };
  if (call.name === "near" && targets.length === 2) return { kind: "near", first: targets[0]!, second: targets[1]!, ...(call.named.distance !== undefined ? { distance: call.named.distance } : {}) };
  diagnostics.push(diagnostic("semantic.invalid_constraint", `Constraint ${call.name} has invalid arguments.`));
  return undefined;
}

function connectorFromBinding(binding: Binding, diagnostics: Diagnostic[]): Connector {
  const [fromValue, toValue] = binding.call.positional;
  const from = parseAnchor(fromValue);
  const to = parseAnchor(toValue);
  if (!from || !to) diagnostics.push(diagnostic("semantic.invalid_connector_anchor", `Connector ${binding.id} requires two node anchors.`));
  const tone = binding.call.named.tone;
  const variant = binding.call.named.variant;
  return { id: binding.id, from: from ?? { node: "invalid" }, to: to ?? { node: "invalid" }, ...(typeof binding.call.named.label === "string" ? { label: binding.call.named.label } : {}), ...(typeof tone === "string" && ["neutral", "info", "success", "warning", "danger"].includes(tone) ? { tone: tone as "neutral" | "info" | "success" | "warning" | "danger" } : {}), ...(typeof variant === "string" && ["directional", "bidirectional", "async", "data"].includes(variant) ? { variant: variant as "directional" | "bidirectional" | "async" | "data" } : {}) };
}

function parseAnchor(value: VisualValue | undefined) {
  if (typeof value !== "string") return undefined;
  const parts = value.split(".");
  const last = parts.at(-1);
  const anchor = last && ["top", "right", "bottom", "left", "center"].includes(last) ? last as AnchorName : undefined;
  const node = anchor ? parts.slice(0, -1).join(".") : value;
  return node ? { node, ...(anchor ? { anchor } : {}) } : undefined;
}

function parseTimeline(header: string, lines: string[], diagnostics: Diagnostic[]): Timeline | undefined {
  const match = /^timeline\s+([A-Za-z_]\w*)\s*\{$/.exec(header);
  if (!match) {
    diagnostics.push(diagnostic("syntax.invalid_timeline", `Invalid timeline declaration ${header}.`));
    return undefined;
  }
  const states: Timeline["states"] = [];
  const transitions: Timeline["transitions"] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    const state = /^state\s+([A-Za-z_]\w*)\s*\{$/.exec(line);
    if (state) {
      const block = collectStringBlock(lines, index, diagnostics);
      const operations = block.body.flatMap((operation) => parseOperation(operation, diagnostics) ?? []);
      states.push({ id: state[1]!, operations });
      index = block.next;
      continue;
    }
    const transition = /^transition\s+([A-Za-z_]\w*)\s*->\s*([A-Za-z_]\w*)(?:\(duration:\s*([A-Za-z_]\w*)\))?$/.exec(line);
    if (transition) transitions.push({ from: transition[1]!, to: transition[2]!, ...(transition[3] ? { duration: transition[3] } : {}) });
    else diagnostics.push(diagnostic("syntax.invalid_timeline_statement", `Invalid timeline statement ${line}.`));
    index += 1;
  }
  const known = new Set(states.map(({ id }) => id));
  for (const transition of transitions) if (!known.has(transition.from) || !known.has(transition.to)) diagnostics.push(diagnostic("semantic.unknown_timeline_state", `Transition ${transition.from} -> ${transition.to} references an unknown state.`));
  return { id: match[1]!, states, transitions };
}

function parseOperation(source: string, diagnostics: Diagnostic[]): TimelineOperation | undefined {
  const call = parseCall(source, diagnostics);
  if (!call) return undefined;
  if (["show", "hide", "focus", "trace"].includes(call.name)) return { action: call.name as "show", targets: call.positional.map(String) };
  if (call.name === "set") return { action: "set", targets: call.positional.map(String), properties: call.named };
  if (call.name === "morph" && call.positional.length === 2) return { action: "morph", targets: call.positional.map(String) as [string, string] };
  diagnostics.push(diagnostic("semantic.unknown_timeline_action", `Unknown timeline action ${call.name}.`));
  return undefined;
}

function substituteCall(call: Call, values: Record<string, VisualValue>): Call {
  return { name: call.name, positional: call.positional.map((value) => substituteValue(value, values)), named: Object.fromEntries(Object.entries(call.named).map(([key, value]) => [key, substituteValue(value, values)])) };
}

function substituteValue(value: VisualValue, values: Record<string, VisualValue>): VisualValue {
  if (typeof value !== "string") return value;
  if (value in values) return values[value]!;
  if (value.length > 128 || !/[+*/()-]/.test(value)) return value;
  const numericValues = Object.fromEntries(Object.entries(values).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  const evaluated = evaluateArithmetic(value, numericValues);
  return evaluated ?? value;
}

function evaluateArithmetic(source: string, values: Record<string, number>): number | undefined {
  const tokens = source.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|[()+*/-]/g);
  if (!tokens || tokens.join("") !== source.replaceAll(/\s/g, "") || tokens.length > 64) return undefined;
  let index = 0;
  const expression = (): number | undefined => {
    let value = term();
    while (value !== undefined && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++]!;
      const right = term();
      if (right === undefined) return undefined;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = (): number | undefined => {
    let value = factor();
    while (value !== undefined && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++]!;
      const right = factor();
      if (right === undefined || (operator === "/" && right === 0)) return undefined;
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const factor = (): number | undefined => {
    const token = tokens[index++];
    if (token === "-") { const value = factor(); return value === undefined ? undefined : -value; }
    if (token === "(") { const value = expression(); if (tokens[index++] !== ")") return undefined; return value; }
    if (token && /^\d/.test(token)) return Number(token);
    return token && token in values ? values[token] : undefined;
  };
  const result = expression();
  return index === tokens.length && result !== undefined && Number.isFinite(result) ? result : undefined;
}

function parseValue(source: string): VisualValue {
  const value = source.trim();
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  if (["xs", "sm", "md", "lg", "xl"].includes(value)) return `$space.${value}`;
  return value;
}

function splitArguments(source: string) {
  const result: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && source[index - 1] !== "\\") quoted = !quoted;
    if (source[index] === "," && !quoted) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const final = source.slice(start).trim();
  if (final) result.push(final);
  return result;
}

function meaningfulLines(source: string) {
  let offset = 0;
  return source.split("\n").flatMap((raw, index) => {
    const text = raw.replace(/\/\/.*$/, "").trim();
    const start = { line: index + 1, column: 1, offset };
    offset += raw.length + 1;
    return text ? [{ text, span: { start, end: { line: index + 1, column: raw.length + 1, offset: offset - 1 } } }] : [];
  });
}

function collectBlock(lines: ReturnType<typeof meaningfulLines>, start: number, diagnostics: Diagnostic[]) {
  return collectObjectBlock(lines, start, diagnostics);
}

function collectStringBlock(lines: string[], start: number, diagnostics: Diagnostic[]) {
  const objects = lines.map((text) => ({ text }));
  const result = collectObjectBlock(objects, start, diagnostics);
  return { body: result.body.map(({ text }) => text), next: result.next };
}

function collectObjectBlock<T extends { text: string }>(lines: T[], start: number, diagnostics: Diagnostic[]) {
  let depth = braceDelta(lines[start]?.text ?? "");
  const body: T[] = [];
  let index = start + 1;
  while (index < lines.length && depth > 0) {
    const line = lines[index]!;
    depth += braceDelta(line.text);
    if (depth > 0) body.push(line);
    index += 1;
  }
  if (depth !== 0) diagnostics.push(diagnostic("syntax.incomplete_block", `Block beginning with ${lines[start]?.text ?? "unknown"} is missing }.`));
  return { body, next: index };
}

function braceDelta(line: string) {
  return [...line].reduce((depth, character) => depth + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
}

function legacyComponent(role: string | undefined): StandardComponentName {
  if (role === "actor") return "person";
  if (role === "database") return "database";
  if (role && role in standardLibrary) return role as StandardComponentName;
  return "service";
}

function legacyAction(action: string): "show" | "hide" | "focus" | "trace" {
  if (action === "hide" || action === "focus" || action === "trace") return action;
  return "show";
}

function formatValue(value: VisualValue) {
  if (typeof value === "string" && value.startsWith("$space.")) return value.slice(7);
  return typeof value === "string" ? `\"${escapeString(value)}\"` : String(value);
}

function formatConstraint(constraint: VisualConstraint) {
  if (constraint.kind === "align") return `align(${constraint.targets.join(", ")}, axis: ${constraint.axis}${constraint.edge ? `, edge: ${constraint.edge}` : ""})`;
  if (constraint.kind === "distribute") return `distribute(${constraint.targets.join(", ")}, axis: ${constraint.axis}${constraint.gap !== undefined ? `, gap: ${formatValue(constraint.gap)}` : ""})`;
  if (constraint.kind === "inside") return `inside(${constraint.child}, ${constraint.container}${constraint.padding !== undefined ? `, padding: ${formatValue(constraint.padding)}` : ""})`;
  return `near(${constraint.first}, ${constraint.second}${constraint.distance !== undefined ? `, distance: ${formatValue(constraint.distance)}` : ""})`;
}

function formatOperation(operation: TimelineOperation) {
  if (operation.action === "set") return `set(${operation.targets.join(", ")}${Object.entries(operation.properties).map(([name, value]) => `, ${name}: ${formatValue(value)}`).join("")})`;
  if (operation.action === "morph") return `morph(${operation.targets.join(", ")})`;
  return `${operation.action}(${operation.targets.join(", ")})`;
}

function escapeString(value: string) { return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'); }

function safeIdentifier(value: string, fallback: string) {
  const identifier = value.replaceAll(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "_$1");
  return identifier || fallback;
}

function requireLegacyCompiler() {
  // Kept behind a local function to make the compatibility boundary explicit.
  return { compile: legacyCompile };
}
