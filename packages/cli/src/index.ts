import { readFile, writeFile } from "node:fs/promises";

import {
  createLayoutPolicyAdapter,
  exportHeadless,
  fastFlowLayoutAdapter,
  type Diagnostic,
  type HeadlessExportFormat,
  type LayoutAdapter,
} from "@jerkeyray/core";
import { exportHeadlessPng } from "@jerkeyray/export-node";
import { createElkLayoutAdapter } from "@jerkeyray/layout-elk";

export type CliOptions = {
  format: HeadlessExportFormat | "png";
  input: string;
  layout: "auto" | "fast";
  output?: string;
  outputWidth?: number;
  pretty: boolean;
  scale?: number;
  width: number;
};

export type CliIo = {
  read(path: string): Promise<string>;
  stderr(value: string): void;
  stdout(value: string | Uint8Array): void;
  write(path: string, value: string | Uint8Array): Promise<void>;
};

export const CLI_HELP = `Usage: livery <input|-> [options]

Options:
  -f, --format <svg|json|png>  Output format; inferred from --output when omitted
  -o, --output <path>          Write to a file instead of stdout
      --layout <auto|fast>     Layout policy (default: auto)
      --width <pixels>         Diagram layout width (default: 960)
      --scale <number>         PNG scale from 0.1 to 8
      --output-width <pixels>  PNG output width independent of layout width
      --pretty                 Pretty-print JSON
  -h, --help                   Show this help`;

export function parseCliArgs(argv: string[]): CliOptions | { help: true } {
  let format: CliOptions["format"] | undefined;
  let input: string | undefined;
  let layout: CliOptions["layout"] = "auto";
  let output: string | undefined;
  let outputWidth: number | undefined;
  let pretty = false;
  let scale: number | undefined;
  let width = 960;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    if (argument === "-f" || argument === "--format") {
      format = formatValue(requiredValue(argv, ++index, argument));
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      output = requiredValue(argv, ++index, argument);
      continue;
    }
    if (argument === "--layout") {
      const value = requiredValue(argv, ++index, argument);
      if (value !== "auto" && value !== "fast") throw new Error(`Invalid layout ${value}.`);
      layout = value;
      continue;
    }
    if (argument === "--width") {
      width = positiveNumber(requiredValue(argv, ++index, argument), argument);
      continue;
    }
    if (argument === "--scale") {
      scale = positiveNumber(requiredValue(argv, ++index, argument), argument);
      continue;
    }
    if (argument === "--output-width") {
      outputWidth = positiveNumber(requiredValue(argv, ++index, argument), argument);
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") throw new Error(`Unknown option ${argument}.`);
    if (input) throw new Error("Only one input file may be provided.");
    input = argument;
  }

  if (!input) throw new Error("An input file or - for stdin is required.");
  format ??= inferFormat(output);
  return {
    format,
    input,
    layout,
    ...(output ? { output } : {}),
    ...(outputWidth !== undefined ? { outputWidth } : {}),
    pretty,
    ...(scale !== undefined ? { scale } : {}),
    width,
  };
}

export async function runCli(argv: string[], io: CliIo = nodeIo): Promise<number> {
  let options: CliOptions | { help: true };
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    io.stderr(`${errorMessage(error)}\n\n${CLI_HELP}\n`);
    return 2;
  }
  if ("help" in options) {
    io.stdout(`${CLI_HELP}\n`);
    return 0;
  }

  try {
    const source = await io.read(options.input);
    const adapter = layoutAdapter(options.layout);
    const result = options.format === "png"
      ? await exportHeadlessPng(source, {
          adapter,
          ...(options.outputWidth !== undefined ? { outputWidth: options.outputWidth } : {}),
          ...(options.scale !== undefined ? { scale: options.scale } : {}),
          width: options.width,
        })
      : await exportHeadless(source, {
          adapter,
          format: options.format,
          pretty: options.pretty,
          width: options.width,
        });
    if (!result.output) {
      io.stderr(`${formatDiagnostics(result.diagnostics)}\n`);
      return 1;
    }
    if (options.output) await io.write(options.output, result.output);
    else io.stdout(result.output);
    return result.artifact ? 0 : 1;
  } catch (error) {
    io.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

function layoutAdapter(layout: CliOptions["layout"]): LayoutAdapter {
  if (layout === "fast") return fastFlowLayoutAdapter;
  return createLayoutPolicyAdapter({ advanced: createElkLayoutAdapter() });
}

function formatDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics.map((item) => {
    const position = item.span ? `${item.span.start.line}:${item.span.start.column} ` : "";
    return `${position}${item.severity} ${item.code}: ${item.message}`;
  }).join("\n");
}

function requiredValue(argv: string[], index: number, option: string) {
  const value = argv[index];
  if (!value) throw new Error(`${option} requires a value.`);
  return value;
}

function positiveNumber(value: string, option: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${option} requires a positive number.`);
  return number;
}

function formatValue(value: string): CliOptions["format"] {
  if (value === "svg" || value === "json" || value === "png") return value;
  throw new Error(`Invalid format ${value}.`);
}

function inferFormat(output?: string): CliOptions["format"] {
  const extension = output?.split(".").pop()?.toLowerCase();
  return extension === "json" || extension === "png" || extension === "svg" ? extension : "svg";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const nodeIo: CliIo = {
  async read(path) {
    if (path === "-") {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    }
    return await readFile(path, "utf8");
  },
  stderr: (value) => process.stderr.write(value),
  stdout: (value) => process.stdout.write(value),
  async write(path, value) {
    await writeFile(path, value);
  },
};
