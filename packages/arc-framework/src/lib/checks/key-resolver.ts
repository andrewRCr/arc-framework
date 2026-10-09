/** Resolve every content dependency before admitting a reusable check key. */
import { resolve } from "node:path";
import type { CheckDeclaration } from "./declaration.js";
import { checkContentKey, type CheckPathContent } from "./key.js";
import { matchTreeInputs, type TreeMatchIO } from "./matching.js";
import type { TreeChange } from "./tree.js";
/** Repository and runtime-fingerprint boundaries for key resolution. */
export interface CheckKeyIO extends TreeMatchIO {
  runtime(command: readonly string[], cwd: string): Promise<{ exitCode: number; stdout: string }>;
}
/** Request content and resolved declarations supplied to key construction. */
export interface CheckKeyContext {
  id: string;
  check: CheckDeclaration["checks"][string];
  definition: CheckDeclaration;
  root: string;
  tree: string;
  paths: string[];
  base?: string;
  merged?: readonly string[];
}
/**
 * Build a content key only when all requested dependencies can be read.
 * @param io - Tree matching boundaries
 * @param context - Checked content and declarations
 * @returns The complete digest, or no key when recording is disabled or a read is unavailable
 */
export async function resolveCheckKey(io: CheckKeyIO, context: CheckKeyContext): Promise<string | null> {
  const { id, check, definition, root, tree, paths } = context;
  if (!check.cache) return null;
  const [inputs, global] = await Promise.all([
    inputContent(io, root, tree, check.inputs), inputContent(io, root, tree, definition.global_inputs),
  ]);
  if (inputs.status !== "known" || global.status !== "known") return null;
  const [globalRuntime, runtime] = await Promise.all([
    runtimeOutputs(io, definition.global_runtime_inputs, root),
    runtimeOutputs(io, check.runtime_inputs, resolve(root, check.root)),
  ]);
  if (globalRuntime === null || runtime === null) return null;
  const base = check.mode === "files" && context.base !== undefined
    ? await receivedContent(io, context, context.base) : undefined;
  if (base === null) return null;
  const merged = check.mode === "files"
    ? await Promise.all((context.merged ?? []).map(parent => receivedContent(io, context, parent))) : [];
  if (!merged.every(content => content !== null)) return null;
  return checkContentKey({ id, declaration: check, inputs: inputs.paths, globalInputs: global.paths, globalRuntime, runtime,
    ...(check.mode === "files" ? { paths, base, merged } : {}) });
}
async function receivedContent(io: CheckKeyIO, context: CheckKeyContext, coordinate: string): Promise<CheckPathContent[] | null> {
  const matching = await inputContent(io, context.root, coordinate, context.check.inputs);
  if (matching.status !== "known") return null;
  const entries = new Map(matching.paths.map(entry => [entry.path, entry]));
  return context.paths.map(path => {
    const entry = entries.get(path);
    return { path, content: entry === undefined ? null : { mode: entry.newMode, blob: entry.newBlob } };
  });
}

async function inputContent(io: CheckKeyIO, root: string, tree: string, inputs: string[]): Promise<TreeChange> {
  try {
    return await matchTreeInputs(io, root, tree, inputs);
  } catch {
    return { status: "unresolved" };
  }
}

async function runtimeOutputs(io: CheckKeyIO, commands: readonly string[][], root: string): Promise<string[] | null> {
  const outputs: string[] = [];
  for (const command of commands) {
    try {
      const result = await io.runtime(command, root);
      if (result.exitCode !== 0) return null;
      outputs.push(result.stdout);
    } catch {
      return null;
    }
  }
  return outputs;
}
