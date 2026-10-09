/** Orchestration for declared repository check requests. */
import { resolve } from "node:path";
import { batchCheckPaths, checkFileArguments } from "../../lib/checks/batching.js";
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import { matchTreeInputs } from "../../lib/checks/matching.js";
import { resolveCheckRequest, type ResolvedCheckRequest } from "../../lib/checks/resolve-request.js";
import { resolveCheckKey, type CheckKeyIO } from "../../lib/checks/key-resolver.js";
import { resolveCheckSelection, selectCheckInputs, type CheckSelection } from "../../lib/checks/selection.js";
import type { CheckRequest } from "../../lib/checks/request.js";
import { selectRequestChecks, checkResultKind, type CheckResultKind } from "../../lib/checks/gates.js";
import type { CheckPassStore } from "../../lib/checks/record.js";

/** One check's externally observable result. */
export interface DeclaredCheckResult {
  id: string;
  kind: CheckResultKind;
  outcome: "passed" | "failed" | "couldn't run" | "not selected" | "reused" | "would run";
  output?: string;
  reason?: string;
}

/** Typed result retained independently of output formatting. */
export type RunDeclaredChecksResult = {
  kind: "result";
  exitCode: 0 | 1 | 2;
  result: { status: "completed" | "none declared"; checks: DeclaredCheckResult[]; base?: string; tree?: string; merged?: string[] };
} | { kind: "error"; exitCode: 2; error: { kind: "invalid" | "refused"; message: string } };

/** Checked content exposed only to file checks. */
export interface CheckContentContext { base?: string; tree: string; merged?: readonly string[] }

/** Repository and command boundaries injected into check orchestration. */
export interface DeclaredCheckDependencies extends CheckKeyIO {
  platform: NodeJS.Platform;
  availableParallelism(): number;
  passes: CheckPassStore;
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string, content?: CheckContentContext, policy?: { shell: boolean }): Promise<{ started: boolean; exitCode: number; output: string }>;
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
  if (entries.length === 0 || declaration.status === "absent") return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [], base, tree } };
  const selection = await resolveCheckSelection(io, root, declaration.value, request, resolved.request, declaration.location);
  const jobs = entries.map(([id, check], position) => ({ id, check, position }));
  const outcomes: Array<{ position: number; result: DeclaredCheckResult }> = [];
  const run = async ({ id, check, position }: (typeof jobs)[number]) => {
    outcomes.push({ position, result: await runRequestedCheck({ id, check, root, resolved: resolved.request, selection, definition: declaration.value, kind: checkResultKind(request.form, check) }, io, request) });
  };
  for (const entry of jobs.filter(job => job.check.fixes)) await run(entry);
  const ordinary = jobs.filter(job => !job.check.fixes);
  let cursor = 0;
  const workers = Math.min(ordinary.length, request.serial ? 1 : io.availableParallelism());
  await Promise.all(Array.from({ length: workers }, async () => {
    for (;;) {
      const entry = ordinary[cursor++];
      if (entry === undefined) return;
      await run(entry);
    }
  }));
  const checks = outcomes.sort((first, second) => first.position - second.position).map(outcome => outcome.result);
  return { kind: "result", exitCode: checks.some(check => check.outcome === "couldn't run") ? 2 : checks.some(check => check.outcome === "failed") ? 1 : 0,
    result: { status: "completed", checks, base, tree, ...(resolved.request.merged ? { merged: resolved.request.merged } : {}) } };
}


async function runRequestedCheck(
  { id, check, root, resolved, selection, kind, definition }: { definition: CheckDeclaration; kind: CheckResultKind; id: string; check: CheckDeclaration["checks"][string]; root: string; resolved: ResolvedCheckRequest; selection: CheckSelection },
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
  return executeSelectedCheck({ id, check, root, tree, paths, kind, definition, ...(check.mode === "files" ? { content: { base: resolved.base, tree, merged: resolved.merged } } : {}) }, io, request.force === true, request.dryRun === true);
}

interface SelectedCheck {
  id: string;
  check: CheckDeclaration["checks"][string];
  root: string;
  tree: string;
  paths: string[];
  content?: CheckContentContext;
  kind: CheckResultKind;
  definition: CheckDeclaration;
}

async function executeSelectedCheck(
  { id, check, root, tree, paths, content, kind, definition }: SelectedCheck, io: DeclaredCheckDependencies, force: boolean, dryRun: boolean,
): Promise<DeclaredCheckResult> {
  const key = await resolveCheckKey(io, { id, check, root, tree, paths, definition, base: content?.base, merged: content?.merged });
  const pass = key === null || force ? null : await io.passes.get(key, id);
  if (pass !== null) return { id, kind, outcome: "reused", output: pass.output };
  if (dryRun) return { id, kind, outcome: "would run" };
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const cwd = resolve(root, check.root);
  const argumentsFromRoot = checkFileArguments(root, cwd, paths, io.platform);
  const result = await executeCheckBatches(io, { command, paths: argumentsFromRoot, cwd, content, check });
  if (!result.started) return { id, kind, outcome: "couldn't run", output: result.output };
  if (result.exitCode === 0 && key !== null) {
    await io.passes.put({ schemaVersion: 1, id, key, outcome: "passed", output: result.output });
  }
  return { id, kind, outcome: result.exitCode === 0 ? "passed" : "failed", output: result.output };
}

async function executeCheckBatches(io: DeclaredCheckDependencies, input: {
  command: readonly string[]; paths: string[]; cwd: string; content?: CheckContentContext; check: CheckDeclaration["checks"][string];
}) {
  const { command, paths, cwd, content, check } = input;
  const outputs: string[] = [];
  let exitCode = 0;
  try {
    const batches = check.mode === "files" ? batchCheckPaths(command, paths, io.platform) : [[]];
    for (const batch of batches) {
      const result = await io.execute([...command, ...batch], cwd, content, { shell: check.shell });
      if (result.output) outputs.push(result.output);
      if (!result.started) return { ...result, output: outputs.join("\n") };
      if (result.exitCode !== 0) exitCode = result.exitCode;
    }
  } catch (error) {
    outputs.push(String(error));
    return { started: false, exitCode: 1, output: outputs.join("\n") };
  }
  return { started: true, exitCode, output: outputs.join("\n") };
}
