import { standardLibrary } from "./stdlib.js";
import { canonicalTheme } from "./theme.js";
import type { AnchorName, ComponentDefinition, PrimitiveKind } from "./visual.js";
import {
  CORE_LANGUAGE_CALLS,
  standardComponentCallContract,
  type LanguageCallContext,
  type LanguageCallContract,
  type LanguageCallStatus,
  type LanguageParameterContract,
} from "./language-contract.js";

export type LanguageCatalogEntry = {
  name: string;
  description: string;
  status: LanguageCallStatus;
  contexts: readonly LanguageCallContext[];
  parameters: readonly LanguageParameterContract[];
};

export type LanguageCatalog = {
  version: "0.1";
  keywords: readonly string[];
  primitives: readonly (PrimitiveKind | "connect")[];
  layouts: readonly LanguageCatalogEntry[];
  constraints: readonly LanguageCatalogEntry[];
  timelineOperations: readonly LanguageCatalogEntry[];
  calls: readonly LanguageCallContract[];
  tokens: readonly string[];
  anchors: readonly AnchorName[];
  components: readonly ComponentDefinition[];
};

const keywords = ["component", "figure", "return", "timeline", "state", "transition"] as const;
const anchors = ["top", "right", "bottom", "left", "center"] as const;

function entries(category: LanguageCallContract["category"]): LanguageCatalogEntry[] {
  return CORE_LANGUAGE_CALLS
    .filter((contract) => contract.category === category)
    .map(({ name, description, status, contexts, positional, named, variadic }) => ({
      name,
      description,
      status,
      contexts,
      parameters: [...positional, ...(variadic ? [variadic] : []), ...named],
    }));
}

function componentContracts(): LanguageCallContract[] {
  return Object.values(standardLibrary).map((component) => standardComponentCallContract(component));
}

export function getLanguageCatalog(): LanguageCatalog {
  const calls = [...CORE_LANGUAGE_CALLS, ...componentContracts()];
  const primitives = CORE_LANGUAGE_CALLS
    .filter(({ category, name }) => category === "primitive" || name === "canvas" || name === "connect")
    .map(({ name }) => name as PrimitiveKind | "connect");
  const tokens = Object.entries(canonicalTheme.tokens)
    .flatMap(([group, values]) => Object.keys(values).map((name) => `${group}.${name}`))
    .sort();
  return {
    version: "0.1",
    keywords,
    primitives,
    layouts: entries("layout"),
    constraints: entries("constraint"),
    timelineOperations: entries("timeline"),
    calls,
    tokens,
    anchors,
    components: Object.values(standardLibrary),
  };
}
