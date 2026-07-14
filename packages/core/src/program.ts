import type { LiveryArtifact } from "./artifact.js";
import { compile as legacyCompile } from "./compiler.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { instantiateStandardComponent, standardLibrary, type StandardComponentName } from "./stdlib.js";
import {
  parseVisualProgram,
  type ParsedBinding,
  type ParsedCall,
  type ParsedComponent,
  type ParsedFigure,
  type ParsedLayout,
} from "./visual-parser.js";
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

type Call = ParsedCall;
type Binding = ParsedBinding;
type LayoutDeclaration = ParsedLayout;
type ComponentSource = ParsedComponent;
type ExpansionContext = { components: Map<string, ComponentSource>; diagnostics: Diagnostic[]; count: number; connectors: Connector[] };

const MAX_COMPONENT_DEPTH = 16;
const MAX_EXPANDED_NODES = 512;

export function compileVisual(source: string): VisualCompileResult {
  const parsed = parseVisualProgram(source);
  const diagnostics = [...parsed.diagnostics];
  if (!parsed.program) return { diagnostics };
  const components = new Map<string, ComponentSource>();
  for (const component of parsed.program.components) {
    validateComponentDeclaration(component, diagnostics);
    if (components.has(component.name)) diagnostics.push(diagnostic("semantic.duplicate_component", `Component ${component.name} is already defined.`, component.span));
    else components.set(component.name, component);
  }
  const [figure] = parsed.program.figures;
  if (parsed.program.figures.length > 1) diagnostics.push(diagnostic("syntax.multiple_documents", "A source file may contain only one figure.", parsed.program.figures[1]?.span));
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
  for (const node of document.root.children ?? []) lines.push(...formatNodeBinding(node, "  "));
  if (document.connectors.length) lines.push("");
  for (const connector of document.connectors) {
    const from = `${connector.from.node}.${connector.from.anchor ?? "right"}`;
    const to = `${connector.to.node}.${connector.to.anchor ?? "left"}`;
    const properties = [...(connector.label ? [`label: \"${escapeString(connector.label)}\"`] : []), ...(connector.variant ? [`variant: ${formatValue(connector.variant)}`] : []), ...(connector.tone && connector.tone !== "neutral" ? [`tone: ${formatValue(connector.tone)}`] : []), ...formatProperties(connector.style)];
    lines.push(`  ${connector.id} = connect(${from}, ${to}${properties.length ? `, ${properties.join(", ")}` : ""})`);
  }
  lines.push("", `  ${formatLayout(document.root.layout, (document.root.children ?? []).map(({ id }) => id))}`);
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

function formatNodeBinding(node: VisualNode, indent: string): string[] {
  const name = node.kind.startsWith("lib.") ? node.kind : node.kind.startsWith("component.") ? "group" : node.kind;
  const positional = node.label !== undefined && !node.kind.startsWith("lib.") ? [`\"${escapeString(node.label)}\"`] : [];
  const named = [
    ...(node.kind.startsWith("lib.") && node.label !== undefined ? [`label: \"${escapeString(node.label)}\"`] : []),
    ...formatProperties(node.props, new Set(["label", "variant", "tone"])),
    ...formatProperties(node.style),
    ...(node.variant ? [`variant: ${formatValue(node.variant)}`] : []),
    ...(node.tone && node.tone !== "neutral" ? [`tone: ${formatValue(node.tone)}`] : []),
  ];
  const args = [...positional, ...named].join(", ");
  if (!node.children?.length) return [`${indent}${node.id} = ${name}(${args})`];
  const lines = [`${indent}${node.id} = group(${args}) {`];
  for (const child of node.children) lines.push(...formatNodeBinding(child, `${indent}  `));
  lines.push(`${indent}}`);
  return lines;
}

function formatLayout(layout: VisualNode["layout"], children: string[]) {
  const kind = layout?.kind ?? "row";
  const named = layout ? formatProperties(Object.fromEntries(Object.entries(layout).filter(([key]) => key !== "kind"))) : [];
  return `${kind}(${[...children, ...named].join(", ")})`;
}

function formatProperties(properties: Record<string, VisualValue> | undefined, omitted = new Set<string>()) {
  return Object.entries(properties ?? {}).filter(([name]) => !omitted.has(name)).map(([name, value]) => `${name}: ${formatValue(value)}`);
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
  figure: ParsedFigure,
  context: ExpansionContext,
): VisualDocument {
  const bindings: Binding[] = [];
  const connectors = context.connectors;
  const timelines: Timeline[] = [];
  const constraints: VisualConstraint[] = [];
  let rootLayout: LayoutDeclaration | undefined;

  for (const item of figure.items) {
    if (item.type === "timeline") {
      timelines.push(item.timeline);
      continue;
    }
    if (item.type === "layout") {
      rootLayout = item.layout;
      continue;
    }
    if (item.type === "binding") {
      if (item.binding.call.name === "connect") connectors.push(connectorFromBinding(item.binding, context.diagnostics));
      else bindings.push(item.binding);
      continue;
    }
    if (item.call.name === "connect") {
      const id = `${String(item.call.positional[0]).replaceAll(".", "-")}--${String(item.call.positional[1]).replaceAll(".", "-")}`;
      connectors.push(connectorFromBinding({ id, call: item.call }, context.diagnostics));
    } else if (["align", "distribute", "inside", "near"].includes(item.call.name)) {
      const constraint = constraintFromCall(item.call, context.diagnostics);
      if (constraint) constraints.push(constraint);
    } else context.diagnostics.push(diagnostic("semantic.unknown_figure_call", `Unknown figure call ${item.call.name}.`, item.call.span));
  }

  reportDuplicateBindings(bindings, "figure", context.diagnostics);

  const nodes = new Map<string, VisualNode>();
  for (const binding of bindings) {
    const node = expandBinding(binding, {}, context, 0);
    if (node) nodes.set(binding.id, node);
  }
  const knownNodeIds = new Set([...nodes.values()].flatMap(flatTimelineTargetIds));
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
  const timelineTargets = new Set([...knownNodeIds, ...connectors.map(({ id }) => id)]);
  for (const timeline of timelines) for (const state of timeline.states) for (const operation of state.operations) {
    for (const id of operation.targets) if (!timelineTargets.has(id)) context.diagnostics.push(diagnostic("semantic.unknown_timeline_target", `Timeline ${timeline.id} references unknown target ${id}.`));
    if (operation.action === "morph") context.diagnostics.push(diagnostic("semantic.unsupported_morph", `Timeline morph ${operation.targets.join(" -> ")} is not supported until geometric interpolation is available.`));
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

function validateComponentDeclaration(component: ComponentSource, diagnostics: Diagnostic[]) {
  const parameterNames = new Set<string>();
  for (const parameter of component.parameters) {
    if (parameterNames.has(parameter.name)) diagnostics.push(diagnostic("semantic.duplicate_component_parameter", `Component ${component.name} declares ${parameter.name} more than once.`, component.span));
    parameterNames.add(parameter.name);
    if (parameter.default !== undefined && !matchesParameterType(parameter.default, parameter.type)) diagnostics.push(diagnostic("semantic.invalid_component_default", `Default value for ${component.name}.${parameter.name} must be ${parameter.type}.`, component.span));
  }
  reportDuplicateBindings(component.bindings, `component ${component.name}`, diagnostics);
  const bindingIds = new Set(component.bindings.filter(({ call }) => call.name !== "connect").map(({ id }) => id));
  for (const child of component.returned?.children ?? []) {
    if (!bindingIds.has(child)) diagnostics.push(diagnostic("semantic.unknown_component_return_child", `Component ${component.name} returns unknown binding ${child}.`, component.returned?.span));
  }
}

function reportDuplicateBindings(bindings: Binding[], owner: string, diagnostics: Diagnostic[]) {
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (ids.has(binding.id)) diagnostics.push(diagnostic("semantic.duplicate_binding", `${owner} declares ${binding.id} more than once.`, binding.span));
    ids.add(binding.id);
    if (binding.children) reportDuplicateBindings(binding.children, `group ${binding.id}`, diagnostics);
  }
}

function flatTimelineTargetIds(node: VisualNode): string[] {
  const repeatIds = node.kind === "repeat" && typeof node.props?.count === "number"
    ? Array.from({ length: Math.max(0, Math.floor(node.props.count)) }, (_, index) => `${node.id}.${index}`)
    : [];
  return [node.id, ...repeatIds, ...(node.children?.flatMap(flatTimelineTargetIds) ?? [])];
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
    context.diagnostics.push(diagnostic("resource.max_expanded_nodes", `Expanded visual exceeds ${MAX_EXPANDED_NODES} nodes.`, binding.span));
    return undefined;
  }
  if (depth > MAX_COMPONENT_DEPTH) {
    context.diagnostics.push(diagnostic("resource.max_component_depth", `Component expansion exceeds depth ${MAX_COMPONENT_DEPTH}.`, binding.span));
    return undefined;
  }
  const call = substituteCall(binding.call, values);
  if (call.name.startsWith("lib.") || call.name in standardLibrary) {
    const name = (call.name.startsWith("lib.") ? call.name.slice(4) : call.name) as StandardComponentName;
    if (!(name in standardLibrary)) {
      context.diagnostics.push(diagnostic("semantic.unknown_library_component", `Unknown library component ${call.name}.`, binding.span));
      return undefined;
    }
    return instantiateStandardComponent(name, binding.id, { ...(typeof call.positional[0] === "string" ? { label: call.positional[0] } : {}), ...call.named });
  }
  if (["text", "box", "circle", "line", "path", "image", "icon", "group", "repeat"].includes(call.name)) {
    if (call.name === "image") validateImageSource(binding.id, call.named.src, context.diagnostics, binding.span);
    if (call.name === "icon" && (typeof call.named.name !== "string" || !["check", "document", "star", "terminal", "warning"].includes(call.named.name))) context.diagnostics.push(diagnostic("semantic.unknown_icon", `Icon ${binding.id} requires a supported name.`, binding.span));
    const styleKeys = new Set(["fill", "stroke", "strokeWidth", "radius", "opacity", "color", "fontSize", "fontWeight"]);
    const style = Object.fromEntries(Object.entries(call.named).filter(([key]) => styleKeys.has(key)));
    const props = Object.fromEntries(Object.entries(call.named).filter(([key]) => !styleKeys.has(key)));
    const children = expandNestedBindings(binding, values, context, depth);
    return { id: binding.id, kind: call.name as VisualNode["kind"], ...(typeof call.positional[0] === "string" ? { label: call.positional[0] } : {}), ...(Object.keys(style).length ? { style } : {}), ...(Object.keys(props).length ? { props } : {}), ...(children.length ? { children } : {}) };
  }
  const definition = context.components.get(call.name);
  if (!definition) {
    context.diagnostics.push(diagnostic("semantic.unknown_component", `Unknown component ${call.name}.`, binding.span));
    return undefined;
  }
  const args: Record<string, VisualValue> = {};
  const parameterNames = new Set(definition.parameters.map(({ name }) => name));
  for (const name of Object.keys(call.named)) if (!parameterNames.has(name)) context.diagnostics.push(diagnostic("semantic.unknown_component_argument", `Component ${definition.name} has no parameter named ${name}.`, binding.span));
  if (call.positional.length > definition.parameters.length) context.diagnostics.push(diagnostic("semantic.excess_component_argument", `Component ${definition.name} accepts ${definition.parameters.length} positional arguments, received ${call.positional.length}.`, binding.span));
  definition.parameters.forEach((parameter, index) => {
    if (call.positional[index] !== undefined && call.named[parameter.name] !== undefined) context.diagnostics.push(diagnostic("semantic.duplicate_component_argument", `Component ${definition.name} received ${parameter.name} twice.`, binding.span));
    const value = call.named[parameter.name] ?? call.positional[index] ?? parameter.default;
    if (value === undefined && parameter.required) context.diagnostics.push(diagnostic("semantic.missing_component_argument", `Component ${definition.name} requires ${parameter.name}.`, binding.span));
    else if (value !== undefined && !matchesParameterType(value, parameter.type)) context.diagnostics.push(diagnostic("semantic.invalid_component_argument", `Component ${definition.name} parameter ${parameter.name} must be ${parameter.type}.`, binding.span));
    else if (value !== undefined) args[parameter.name] = value;
  });
  for (const child of definition.bindings) {
    if (child.call.name === "connect") {
      const connector = connectorFromBinding({ ...child, call: substituteCall(child.call, args) }, context.diagnostics);
      context.connectors.push({
        ...connector,
        id: `${binding.id}.${connector.id}`,
        from: { ...connector.from, node: `${binding.id}.${connector.from.node}` },
        to: { ...connector.to, node: `${binding.id}.${connector.to.node}` },
      });
    }
  }
  const visualBindings = definition.bindings.filter(({ call }) => call.name !== "connect");
  const visualById = new Map(visualBindings.map((child) => [child.id, child]));
  const returnedBindings = definition.returned
    ? definition.returned.children.flatMap((id) => visualById.get(id) ?? [])
    : visualBindings;
  const children = returnedBindings.flatMap((child) => {
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

function validateImageSource(id: string, value: VisualValue | undefined, diagnostics: Diagnostic[], span?: ParsedBinding["span"]) {
  if (typeof value !== "string" || value.length === 0) {
    diagnostics.push(diagnostic("semantic.invalid_image_source", `Image ${id} requires a source string.`, span));
    return;
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https" && !(scheme === "data" && value.startsWith("data:image/"))) diagnostics.push(diagnostic("semantic.invalid_image_source", `Image ${id} uses unsupported source protocol ${scheme}.`, span));
}

function expandNestedBindings(binding: Binding, values: Record<string, VisualValue>, context: ExpansionContext, depth: number) {
  return (binding.children ?? []).flatMap((child) => {
    if (child.call.name === "connect") {
      const connector = connectorFromBinding({ ...child, call: substituteCall(child.call, values) }, context.diagnostics);
      context.connectors.push({
        ...connector,
        id: `${binding.id}.${connector.id}`,
        from: { ...connector.from, node: `${binding.id}.${connector.from.node}` },
        to: { ...connector.to, node: `${binding.id}.${connector.to.node}` },
      });
      return [];
    }
    const expanded = expandBinding({ ...child, id: `${binding.id}.${child.id}` }, values, context, depth + 1);
    return expanded ? [expanded] : [];
  });
}

function matchesParameterType(value: VisualValue, type: ComponentParameter["type"]) {
  if (type === "tone") return typeof value === "string" && ["neutral", "info", "success", "warning", "danger"].includes(value);
  return typeof value === type;
}

function prefixLocalReferences(node: VisualNode, instanceId: string, localIds: Set<string>): VisualNode {
  const props = node.props ? Object.fromEntries(Object.entries(node.props).map(([key, value]) => [key, (key === "clip" || key === "mask") && typeof value === "string" && localIds.has(value) ? `${instanceId}.${value}` : value])) : undefined;
  return { ...node, ...(props ? { props } : {}), ...(node.children ? { children: node.children.map((child) => prefixLocalReferences(child, instanceId, localIds)) } : {}) };
}

function constraintFromCall(call: Call, diagnostics: Diagnostic[]): VisualConstraint | undefined {
  const targets = call.positional.map(String);
  if (call.name === "align" && targets.length >= 2) {
    const edge = typeof call.named.edge === "string" && ["start", "center", "end"].includes(call.named.edge) ? call.named.edge as "start" | "center" | "end" : undefined;
    return { kind: "align", targets, axis: call.named.axis === "y" ? "y" : "x", ...(edge ? { edge } : {}) };
  }
  if (call.name === "distribute" && targets.length >= 3) return { kind: "distribute", targets, axis: call.named.axis === "y" ? "y" : "x", ...(call.named.gap !== undefined ? { gap: call.named.gap } : {}) };
  if (call.name === "inside" && targets.length === 2) return { kind: "inside", child: targets[0]!, container: targets[1]!, ...(call.named.padding !== undefined ? { padding: call.named.padding } : {}) };
  if (call.name === "near" && targets.length === 2) return { kind: "near", first: targets[0]!, second: targets[1]!, ...(call.named.distance !== undefined ? { distance: call.named.distance } : {}) };
  diagnostics.push(diagnostic("semantic.invalid_constraint", `Constraint ${call.name} has invalid arguments.`, call.span));
  return undefined;
}

function connectorFromBinding(binding: Binding, diagnostics: Diagnostic[]): Connector {
  const [fromValue, toValue] = binding.call.positional;
  const from = parseAnchor(fromValue);
  const to = parseAnchor(toValue);
  if (!from || !to) diagnostics.push(diagnostic("semantic.invalid_connector_anchor", `Connector ${binding.id} requires two node anchors.`, binding.span));
  const tone = binding.call.named.tone;
  const variant = binding.call.named.variant;
  if (variant !== undefined && (typeof variant !== "string" || !["directional", "bidirectional", "async", "data"].includes(variant))) diagnostics.push(diagnostic("semantic.invalid_connector_variant", `Connector ${binding.id} has invalid variant ${String(variant)}.`, binding.span));
  const styleKeys = new Set(["fill", "stroke", "strokeWidth", "radius", "opacity", "color"]);
  const style = Object.fromEntries(Object.entries(binding.call.named).filter(([key]) => styleKeys.has(key)));
  return { id: binding.id, from: from ?? { node: "invalid" }, to: to ?? { node: "invalid" }, ...(typeof binding.call.named.label === "string" ? { label: binding.call.named.label } : {}), ...(typeof tone === "string" && ["neutral", "info", "success", "warning", "danger"].includes(tone) ? { tone: tone as "neutral" | "info" | "success" | "warning" | "danger" } : {}), ...(typeof variant === "string" && ["directional", "bidirectional", "async", "data"].includes(variant) ? { variant: variant as "directional" | "bidirectional" | "async" | "data" } : {}), ...(Object.keys(style).length ? { style } : {}) };
}

function parseAnchor(value: VisualValue | undefined) {
  if (typeof value !== "string") return undefined;
  const parts = value.split(".");
  const last = parts.at(-1);
  const anchor = last && ["top", "right", "bottom", "left", "center"].includes(last) ? last as AnchorName : undefined;
  const node = anchor ? parts.slice(0, -1).join(".") : value;
  return node ? { node, ...(anchor ? { anchor } : {}) } : undefined;
}

function substituteCall(call: Call, values: Record<string, VisualValue>): Call {
  return { name: call.name, positional: call.positional.map((value) => substituteValue(value, values)), named: Object.fromEntries(Object.entries(call.named).map(([key, value]) => [key, substituteValue(value, values)])), ...(call.span ? { span: call.span } : {}) };
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
