/** Orchestration for declared repository check requests. */
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import type { TreeMatchIO } from "../../lib/checks/matching.js";
import { matchTreeInputs } from "../../lib/checks/matching.js";
import { resolveCheckRequest, type ResolvedCheckRequest } from "../../lib/checks/resolve-request.js";
import { checkContentKey } from "../../lib/checks/key.js";
import { resolveCheckSelection, selectCheckInputs, type CheckSelection } from "../../lib/checks/selection.js";
import type { CheckRequest } from "../../lib/checks/request.js";
import { selectRequestChecks, checkResultKind, type CheckResultKind } from "../../lib/checks/gates.js";
import type { CheckPassStore } from "../../lib/checks/record.js";

/** One check's externally observable result. */
export interface DeclaredCheckResult {
  id: string;
  kind: CheckResultKind;
  outcome: "passed" | "failed" | "not selected" | "reused" | "would run";
  output?: string;
  reason?: string;
}

/** Typed result retained independently of output formatting. */
export type RunDeclaredChecksResult = {
  kind: "result";
  exitCode: 0 | 1;
  result: { status: "completed" | "none declared"; checks: DeclaredCheckResult[]; base?: string; tree?: string; merged?: string[] };
} | { kind: "error"; exitCode: 2; error: { kind: "invalid" | "refused"; message: string } };

/** Checked content exposed only to file checks. */
export interface CheckContentContext { base?: string; tree: string; merged?: readonly string[] }

/** Repository and command boundaries injected into check orchestration. */
export interface DeclaredCheckDependencies extends TreeMatchIO {
  passes: CheckPassStore;
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string, content?: CheckContentContext): Promise<{ exitCode: number; output: string }>;
}

/**
 * Run the increment-boundary request over repository content.
 * @param root - Resolved repository root
 * @param io - Injectable repository and command boundaries
 * @param options - Whether selected checks must execute despite reusable passes
 * @returns Named outcomes and the request's exit status
 */
export async function runCheckIncrement(root: string, io: DeclaredCheckDependencies, options: { force?: boolean } = {}): Promise<RunDeclaredChecksResult> {
  return runDeclaredRequest(root, io, { form: { kind: "increment" }, ...options });
}

/**
 * Run the commit request over the index supplied by Git.
 * @param root - Repository root from which relative hook index paths resolve
 * @param io - Injectable repository and command boundaries
 * @param options - Force policy and optional exact index supplied by Git
 * @returns Named outcomes and the request's exit status
 */
export async function runCheckPreCommit(
  root: string, io: DeclaredCheckDependencies, options: { force?: boolean; indexFile?: string } = {},
): Promise<RunDeclaredChecksResult> {
  return runDeclaredRequest(root, io, { form: { kind: "pre-commit" }, ...options });
}

/**
 * Run explicitly named checks independently of their gates.
 * @param root - Repository root
 * @param io - Repository and execution boundaries
 * @param ids - Declared identifiers to run
 * @param options - Reuse policy
 * @returns Named outcomes or a refusal naming an unknown identifier
 */
export async function runCheckRun(root: string, io: DeclaredCheckDependencies, ids: string[], options: { force?: boolean } = {}): Promise<RunDeclaredChecksResult> {
  return runDeclaredRequest(root, io, { form: { kind: "run", ids }, ...options });
}

/**
 * Resolve and execute a validated repository check request.
 * @param root - Repository root
 * @param io - Repository and execution boundaries
 * @param request - Form, scope, and execution policy
 * @returns Check outcomes or an input refusal before execution
 */
export async function runDeclaredRequest(
  root: string, io: DeclaredCheckDependencies, request: CheckRequest,
): Promise<RunDeclaredChecksResult> {
  const declaration = await io.readDeclaration(root);
  if (declaration.status === "invalid") return { kind: "error", exitCode: 2,
    error: { kind: "invalid", message: `${declaration.location}: ${declaration.message}` } };
  const ids = request.form.kind === "run" ? request.form.ids : undefined;
  const available = declaration.status === "absent" ? {} : declaration.value.checks;
  const missing = ids?.find(id => available[id] === undefined);
  if (missing !== undefined) return { kind: "error", exitCode: 2,
    error: { kind: "refused", message: `Unknown check ${missing}; name a check declared in arc-checks.yml and retry.` } };
  const entries = selectRequestChecks(available, request.form);
  const resolved = await resolveCheckRequest(io.git, root, request);
  if (resolved.status === "refused") return { kind: "error", exitCode: 2, error: { kind: "refused", message: resolved.message } };
  const { base, tree } = resolved.request;
  if (entries.length === 0) return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [], base, tree } };
  const selection = await resolveCheckSelection(io, root, declaration.status === "absent" ? { checks: {}, global_inputs: [], global_runtime_inputs: [], commit_fixes: "restage" } : declaration.value, request, resolved.request);
  const checks: DeclaredCheckResult[] = [];
  for (const [id, check] of entries) {
    checks.push(await runRequestedCheck({ id, check, root, resolved: resolved.request, selection, kind: checkResultKind(request.form, check) }, io, request));
  }
  return { kind: "result", exitCode: checks.some(check => check.outcome === "failed") ? 1 : 0,
    result: { status: "completed", checks, base, tree, ...(resolved.request.merged ? { merged: resolved.request.merged } : {}) } };
}


async function runRequestedCheck(
  { id, check, root, resolved, selection, kind }: { kind: CheckResultKind; id: string; check: CheckDeclaration["checks"][string]; root: string; resolved: ResolvedCheckRequest; selection: CheckSelection },
  io: DeclaredCheckDependencies, request: CheckRequest,
): Promise<DeclaredCheckResult> {
  const { tree } = resolved;
  const selected = selectCheckInputs({ id, check, request, resolved, selection });
  if (selected.status === "not selected") return { id, kind, outcome: "not selected", reason: selected.reason };
  let paths: string[] = [];
  if (check.mode === "files") {
    const matching = selected.paths !== undefined ? { status: "known" as const, paths: selected.paths }
      : await matchTreeInputs(io, root, tree, check.inputs);
    if (matching.status !== "known") throw new Error(`Could not resolve inputs for ${id}; retry the check request.`);
    paths = matching.paths.filter(path => path.newMode !== "000000").map(path => path.path);
    if (paths.length === 0) return { id, kind, outcome: "not selected", reason: "no files to check" };
  }
  return executeSelectedCheck({ id, check, root, tree, paths, kind, ...(check.mode === "files" ? { content: { base: resolved.base, tree, merged: resolved.merged } } : {}) }, io, request.force === true, request.dryRun === true);
}

interface SelectedCheck {
  id: string;
  check: CheckDeclaration["checks"][string];
  root: string;
  tree: string;
  paths: string[];
  content?: CheckContentContext;
  kind: CheckResultKind;
}

async function executeSelectedCheck(
  { id, check, root, tree, paths, content, kind }: SelectedCheck, io: DeclaredCheckDependencies, force: boolean, dryRun: boolean,
): Promise<DeclaredCheckResult> {
  const inputs = check.cache ? await matchTreeInputs(io, root, tree, check.inputs) : null;
  const key = inputs?.status === "known" ? checkContentKey({ id, declaration: check, inputs: inputs.paths,
    ...(check.mode === "files" ? { paths } : {}) }) : null;
  const pass = key === null || force ? null : await io.passes.get(key, id);
  if (pass !== null) return { id, kind, outcome: "reused", output: pass.output };
  if (dryRun) return { id, kind, outcome: "would run" };
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const result = await io.execute([...command, ...paths], root, content);
  if (result.exitCode === 0 && key !== null) {
    await io.passes.put({ schemaVersion: 1, id, key, outcome: "passed", output: result.output });
  }
  return { id, kind, outcome: result.exitCode === 0 ? "passed" : "failed", output: result.output };
}
