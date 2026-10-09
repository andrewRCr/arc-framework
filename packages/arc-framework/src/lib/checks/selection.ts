/** Determine changed-input reach and conservative widening for a resolved request. */
import type { CheckDeclaration } from "./declaration.js";
import type { CheckRequest } from "./request.js";
import type { ResolvedCheckRequest } from "./resolve-request.js";
import { matchTreeInputs, selectChangedInputs, type InputSelection, type TreeMatchIO } from "./matching.js";
import { readTreeChange, type TreeChange, type TreePathChange } from "./tree.js";

/** Own-input observations and whether shared uncertainty widens this request. */
export interface CheckSelection {
  own: Map<string, InputSelection>;
  widened: boolean;
}

/**
 * Read the request's changed inputs and shared widening triggers.
 * @param io - Repository matching boundaries
 * @param root - Repository root
 * @param declaration - Complete validated declaration, including checks outside the requested gates
 * @param request - Requested form and selection scope
 * @param resolved - Exact checked tree and optional base
 * @param declarationLocation - Repository-relative declaration path supplied by the configuration reader
 * @returns Own-input observations plus the shared widening decision
 */
export async function resolveCheckSelection(
  io: TreeMatchIO, root: string, declaration: CheckDeclaration, request: CheckRequest, resolved: ResolvedCheckRequest, declarationLocation: string,
): Promise<CheckSelection> {
  const { base, tree, scope } = resolved;
  const own = new Map<string, InputSelection>();
  if (scope.kind === "all") return { own, widened: false };
  for (const [id, check] of Object.entries(declaration.checks)) {
    own.set(id, await ownInputChange(io, root, resolved, check.inputs));
  }
  if (request.form.kind === "run") return { own, widened: false };
  if (base === undefined) return { own, widened: true };
  const change = resolved.mergePaths !== undefined ? await namedPathChange(io, root, tree, resolved.mergePaths, ["**"], true)
    : scope.kind === "paths" ? await namedPathChange(io, root, tree, scope.paths, ["**"])
    : await readTreeChange(io.git, root, base, tree);
  if (change.status === "unresolved") return { own, widened: true };
  const global = await ownInputChange(io, root, resolved, declaration.global_inputs);
  const covered = new Set([...own.values()].flatMap(selection => selection.status === "selected" ? selection.paths.map(path => path.path) : []));
  const widened = global.status !== "not selected" || [...own.values()].some(selection => selection.status === "unresolved")
    || change.paths.some(path => path.path === declarationLocation || !covered.has(path.path));
  return { own, widened };
}


async function ownInputChange(io: TreeMatchIO, root: string, resolved: ResolvedCheckRequest, inputs: string[]): Promise<InputSelection> {
  if (resolved.mergePaths !== undefined || resolved.scope.kind === "paths") {
    const names = resolved.mergePaths ?? (resolved.scope.kind === "paths" ? resolved.scope.paths : []);
    const change = await namedPathChange(io, root, resolved.tree, names, inputs, resolved.mergePaths !== undefined);
    if (change.status === "unresolved") return change;
    return change.paths.length === 0 ? { status: "not selected", reason: "inputs unchanged" } : { status: "selected", paths: change.paths };
  }
  return resolved.base === undefined ? { status: "unresolved" }
    : selectChangedInputs(io.git, root, resolved.base, resolved.tree, inputs);
}

async function namedPathChange(io: TreeMatchIO, root: string, tree: string, names: string[], inputs: string[], exact = false): Promise<TreeChange> {
  const [current, previous] = await Promise.all([matchTreeInputs(io, root, tree, inputs), matchTreeInputs(io, root, "HEAD", inputs)]);
  if (current.status === "unresolved" || previous.status === "unresolved") return { status: "unresolved" };
  const paths = new Map(current.paths.map(path => [path.path, path]));
  for (const path of previous.paths) {
    if (!paths.has(path.path)) paths.set(path.path, { ...path, status: "D", oldMode: path.newMode, oldBlob: path.newBlob,
      newMode: "000000", newBlob: "0".repeat(path.newBlob.length) });
  }
  return { status: "known", paths: [...paths.values()].filter(path => names.some(name => path.path === name || (!exact && path.path.startsWith(`${name}/`)))) };
}


/** Selected changed paths, all matching paths, or an explicit exclusion. */
export type SelectedCheckInputs = { status: "selected"; paths?: TreePathChange[] }
  | { status: "not selected"; reason: string };

/**
 * Apply one check's explicit invocation, CI policy, and widening opt-out to observed input reach.
 * @param input - Check identity, declaration, request, resolved scope, and observed reach
 * @returns Changed paths, all paths, or a named exclusion
 */
export function selectCheckInputs(input: {
  id: string; check: CheckDeclaration["checks"][string]; request: CheckRequest;
  resolved: ResolvedCheckRequest; selection: CheckSelection;
}): SelectedCheckInputs {
  const { id, check, request, resolved, selection } = input;
  if (check.ci_only && request.form.kind !== "run" && !request.ci) return { status: "not selected", reason: "CI-only check requires --ci" };
  if (resolved.scope.kind === "all" || (request.form.kind === "run" && check.mode === "project")) return { status: "selected" };
  if (request.form.kind !== "run" && selection.widened && check.widen) return { status: "selected" };
  const own = selection.own.get(id) ?? { status: "not selected" as const, reason: "inputs unchanged" };
  if (own.status !== "unresolved") return own;
  return request.form.kind === "run" ? { status: "selected" }
    : { status: "not selected", reason: "own input change unavailable" };
}
