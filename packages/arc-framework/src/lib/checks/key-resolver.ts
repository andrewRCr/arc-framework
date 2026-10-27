/** Resolve every content dependency before admitting a reusable check key. */
import { resolve } from "node:path";
import type { CheckDeclaration } from "./declaration.js";
import { checkContentKey, type CheckKeyInput, type CheckMaterializedPathContent, type CheckPathContent } from "./key.js";
import { matchTreeInputs, type TreeMatchIO } from "./matching.js";
import type { TreeChange, TreePathChange } from "./tree.js";
import type { SourcePresentationIndex } from "./runner/source-scope.js";
/** Repository and runtime-fingerprint boundaries for key resolution. */
export interface CheckKeyIO extends TreeMatchIO {
  runtime(command: readonly string[], cwd: string, environment?: NodeJS.ProcessEnv): Promise<{ exitCode: number; stdout: string }>;
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
  /** Frozen explicit inputs shared by runtime qualification and command execution. */
  environmentIdentity?: string;
}

/** Content dependencies without observations of an execution runtime. */
export type CheckKeyMaterial = Omit<CheckKeyInput, "globalRuntime" | "runtime" | "preparedRuntime">;

/** Optional captured Git and presentation boundaries, excluding caller-local runtime execution. */
export interface CheckKeyMaterialIO extends TreeMatchIO {
  readonly capturedSource?: { readonly root: string; readonly index: SourcePresentationIndex };
}

/** Read content dependencies without dispatching runtime-fingerprint commands. */
export async function resolveCheckKeyMaterial(io: CheckKeyMaterialIO, context: CheckKeyContext): Promise<CheckKeyMaterial | null> {
  const source = io.capturedSource;
  const selected = source === undefined ? context : { ...context, root: source.root };
  const current = await currentContent(io, selected);
  if (current === null) return null;
  const material = await completeMaterial(io, selected, current);
  if (material === null || source === undefined) return material;
  const materializedInputs = scopedPresentation(source.index, [...current.inputs, ...current.globalInputs]);
  return materializedInputs === null ? null : { ...material, materializedInputs };
}

function scopedPresentation(index: SourcePresentationIndex, inputs: readonly TreePathChange[]): readonly CheckMaterializedPathContent[] | null {
  try {
    const paths = [...new Set(inputs.map(entry => entry.path))].sort();
    const entries: CheckMaterializedPathContent[] = [];
    for (const path of paths) {
      const read = index.read(path);
      if (read.status !== "present" || read.path !== path) return null;
      entries.push(Object.freeze({ path, entry: Object.freeze({ ...read.entry }) }));
    }
    return Object.freeze(entries);
  } catch { return null; }
}
/**
 * Build a content key only when all requested dependencies can be read.
 * @param io - Tree matching boundaries
 * @param context - Checked content and declarations
 * @returns The complete digest, or no key when recording is disabled or a read is unavailable
 */
export async function resolveCheckKey(io: CheckKeyIO, context: CheckKeyContext): Promise<string | null> {
  const { check, definition, root } = context;
  const current = await currentContent(io, context);
  if (current === null) return null;
  const [globalRuntime, runtime] = await Promise.all([
    runtimeOutputs(io, definition.global_runtime_inputs, root),
    runtimeOutputs(io, check.runtime_inputs, resolve(root, check.root)),
  ]);
  if (globalRuntime === null || runtime === null) return null;
  const material = await completeMaterial(io, context, current);
  return material === null ? null : checkContentKey({ ...material, globalRuntime, runtime });
}

interface CurrentContent { inputs: readonly TreePathChange[]; globalInputs: readonly TreePathChange[] }

async function currentContent(io: TreeMatchIO, context: CheckKeyContext): Promise<CurrentContent | null> {
  const { check, definition, root, tree } = context;
  if (!check.cache) return null;
  const [inputs, global] = await Promise.all([
    inputContent(io, root, tree, check.inputs), inputContent(io, root, tree, definition.global_inputs),
  ]);
  if (inputs.status !== "known" || global.status !== "known") return null;
  return { inputs: inputs.paths, globalInputs: global.paths };
}

async function completeMaterial(io: TreeMatchIO, context: CheckKeyContext, current: CurrentContent): Promise<CheckKeyMaterial | null> {
  const { id, check, paths } = context;
  const base = check.mode === "files" && context.base !== undefined
    ? await historicalContent(io, context, context.base) : undefined;
  if (base === null) return null;
  const merged = check.mode === "files"
    ? await Promise.all((context.merged ?? []).map(parent => historicalContent(io, context, parent))) : [];
  if (!merged.every(content => content !== null)) return null;
  return { id, declaration: check, ...current,
    environmentIdentity: context.environmentIdentity,
    ...(check.mode === "files" ? { paths, base, merged } : {}) };
}
async function historicalContent(io: TreeMatchIO, context: CheckKeyContext, coordinate: string): Promise<CheckPathContent[] | null> {
  const groups = await Promise.all([context.check.inputs, context.definition.global_inputs]
    .map(inputs => inputContent(io, context.root, coordinate, inputs)));
  if (groups.some(group => group.status !== "known")) return null;
  const entries = new Map<string, CheckPathContent>(context.paths.map(path => [path, { path, content: null }]));
  for (const group of groups) {
    if (group.status !== "known") return null;
    for (const entry of group.paths) entries.set(entry.path,
      { path: entry.path, content: { mode: entry.newMode, blob: entry.newBlob } });
  }
  return [...entries.values()].sort((first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0);
}

async function inputContent(io: TreeMatchIO, root: string, tree: string, inputs: string[]): Promise<TreeChange> {
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
