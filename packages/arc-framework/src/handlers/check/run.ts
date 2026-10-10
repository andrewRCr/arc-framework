/** Orchestration for declared repository check requests. */
import { tmpdir } from "node:os";
import type { PushRefDisposition } from "../../lib/checks/push.js";
import { mkdir } from "node:fs/promises";
import { checkRecordDirectory } from "../../lib/checks/record.js";
import { resolve } from "node:path";
import { batchCheckPaths, checkFileArguments } from "../../lib/checks/batching.js";
import { readCheckDivergence } from "../../lib/checks/divergence.js";
import { findPartiallyStagedChecks } from "../../lib/checks/partial-staging.js";
import { commitRestageAllowed, restageCommitFixes } from "../../lib/checks/commit-fixes.js";
import { checkFixesAllowed, refreshFixerContent } from "../../lib/checks/fixers.js";
import { type TreePathChange, createWorktreeSnapshot, stagedWorktreeTree } from "../../lib/checks/tree.js";
import { createCheckIndexViews, type CheckIndexViews } from "../../lib/checks/index-view.js";
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import { matchTreeInputs } from "../../lib/checks/matching.js";
import { resolveCheckRequest, type ResolvedCheckRequest } from "../../lib/checks/resolve-request.js";
import { resolveCheckKey, type CheckKeyIO } from "../../lib/checks/key-resolver.js";
import { resolveCheckSelection, selectCheckInputs, type CheckSelection } from "../../lib/checks/selection.js";
import { isCheckHookForm, type CheckRequest } from "../../lib/checks/request.js";
import { selectRequestChecks, checkResultKind, type CheckResultKind } from "../../lib/checks/gates.js";
import type { CheckPassStore } from "../../lib/checks/record.js";
import type { CheckReportStore } from "../../lib/checks/reports.js";
import { checkVerification } from "./report.js";
import { checkRetryCommand } from "../../lib/checks/remedies.js";
import { resolveCheckForecast, type CheckForecast } from "../../lib/checks/forecast.js";

/** One check's externally observable result. */
export interface DeclaredCheckResult extends Partial<CheckForecast> {
  id: string;
  kind: CheckResultKind;
  outcome: "passed" | "failed" | "couldn't run" | "not selected" | "reused" | "would run" | "skipped";
  output?: string;
  reason?: string;
  divergent?: string[];
  rewritten?: string[];
  logPath?: string;
  costMs?: number;
  lastCostMs?: number;
  remedy?: string;
}

/** Typed result retained independently of output formatting. */
export type RunDeclaredChecksResult = {
  kind: "result";
  exitCode: 0 | 1 | 2;
  result: { status: "completed" | "none declared"; checks: DeclaredCheckResult[]; verification?: string; ci?: boolean; base?: string; tree?: string; merged?: string[]; ignoredSkips?: string[]; pushRefs?: PushRefDisposition[] };
} | { kind: "error"; exitCode: 2; error: { kind: "invalid" | "refused"; message: string }
  | { kind: "usage"; code: string; message: string } };

/**
 * Classify a request from all named outcomes, with unavailable execution taking precedence.
 * @param checks - Every included check outcome
 * @returns Success, failure, or unavailable-execution exit status
 */
export function declaredChecksExitCode(checks: readonly DeclaredCheckResult[]): 0 | 1 | 2 {
  if (checks.some(check => check.outcome === "couldn't run")) return 2;
  return checks.some(check => check.outcome === "failed") ? 1 : 0;
}

/** Checked content exposed only to file checks. */
export interface CheckContentContext { base?: string; tree: string; merged?: readonly string[] }

/** Repository and command boundaries injected into check orchestration. */
export interface DeclaredCheckDependencies extends CheckKeyIO {
  platform: NodeJS.Platform;
  availableParallelism(): number;
  passes: CheckPassStore;
  reports?: CheckReportStore;
  now?(): number;
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string, content?: CheckContentContext, policy?: { shell: boolean; indexFile?: string }): Promise<{ started: boolean; exitCode: number; output: string }>;
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
  const ignoredSkips = isCheckHookForm(request.form)
    ? [...new Set(request.skip ?? [])].filter(id => !Object.hasOwn(available, id)) : [];
  const missing = ids?.find(id => !Object.hasOwn(available, id));
  if (missing !== undefined) return { kind: "error", exitCode: 2,
    error: { kind: "refused", message: `Unknown check ${missing}; name a check declared in arc-checks.yml and retry.` } };
  const entries = selectRequestChecks(available, request.form);
  const snapshotDirectory = entries.some(([, check]) => check.reads_index) ? await checkRecordDirectory(io.git, root)
    : entries.some(([, check]) => check.fixes) ? tmpdir() : undefined;
  if (snapshotDirectory !== undefined) await mkdir(snapshotDirectory, { recursive: true });
  const resolved = await resolveCheckRequest(io.git, root, request, snapshotDirectory);
  if (resolved.status === "refused") return { kind: "error", exitCode: 2, error: { kind: "refused", message: resolved.message } };
  const indexViews = createCheckIndexViews(io.git, root, request, resolved.request);
  try {
    const outcome = await executeResolvedRequest(root, io, request, declaration, entries, resolved.request, indexViews);
    return outcome.kind === "result" && ignoredSkips.length > 0
      ? { ...outcome, result: { ...outcome.result, ignoredSkips } } : outcome;
  } finally {
    await indexViews.remove();
    await resolved.request.snapshot?.remove();
  }
}

async function executeResolvedRequest(
  root: string, io: DeclaredCheckDependencies, request: CheckRequest,
  declaration: Exclude<TypedFileResult<CheckDeclaration>, { status: "invalid" }>,
  entries: Array<[string, CheckDeclaration["checks"][string]]>, coordinates: ResolvedCheckRequest, indexViews: CheckIndexViews,
): Promise<RunDeclaredChecksResult> {
  const { base, tree } = coordinates;
  if (entries.length === 0 || declaration.status === "absent") return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [], base, tree, verification: checkVerification("none declared", []), ...(request.ci ? { ci: true } : {}) } };
  if (entries.some(([, check]) => check.fixes) && coordinates.snapshot === undefined) {
    coordinates.snapshot = await createWorktreeSnapshot(io.git, root, coordinates.snapshotDirectory);
  }
  coordinates.worktreeTree = coordinates.snapshot?.tree ?? (coordinates.scope.kind === "staged" || request.form.kind === "pre-push" ? await stagedWorktreeTree(io.git, root) : tree);
  const selection = await resolveCheckSelection(io, root, declaration.value, request, coordinates, declaration.location);
  const refusal = await partiallyStagedRefusal(io, { root, request, entries, coordinates, selection });
  if (refusal !== undefined) return { kind: "error", exitCode: 2, error: { kind: "refused", message: refusal } };
  const jobs = entries.map(([id, check], position) => ({ id, check, position }));
  const outcomes: Array<{ position: number; result: DeclaredCheckResult }> = [];
  const run = async ({ id, check, position }: (typeof jobs)[number]) => {
    const result = await runRequestedCheck({ id, check, root, resolved: coordinates, selection, selectionTree: tree, indexViews, definition: declaration.value, kind: checkResultKind(request.form, check) }, io, request);
    if (request.dryRun) {
      const last = await io.reports?.latest(id);
      if (last) result.lastCostMs = last.costMs;
    }
    outcomes.push({ position, result });
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
  return { kind: "result", exitCode: declaredChecksExitCode(checks),
    result: { status: "completed", checks, verification: checkVerification("completed", checks), ...(request.ci ? { ci: true } : {}), base, tree: coordinates.tree, ...(coordinates.merged ? { merged: coordinates.merged } : {}) } };
}


async function runRequestedCheck(
  { id, check, root, resolved, selection, kind, definition, indexViews, selectionTree }: { selectionTree: string; indexViews: CheckIndexViews; definition: CheckDeclaration; kind: CheckResultKind; id: string; check: CheckDeclaration["checks"][string]; root: string; resolved: ResolvedCheckRequest; selection: CheckSelection },
  io: DeclaredCheckDependencies, request: CheckRequest,
): Promise<DeclaredCheckResult> {
  if (isSkippedHookCheck(request, id)) return { id, kind, outcome: "skipped", reason: "ARC_SKIP" };
  let { tree } = resolved;
  let forecast = request.dryRun ? resolveCheckForecast(check, root, [], io.platform) : {};
  const selected = selectCheckInputs({ id, check, request, resolved, selection });
  if (selected.status === "not selected") return { id, kind, ...forecast, outcome: "not selected", reason: selected.reason };
  let paths: string[] = [];
  if (check.mode === "files") {
    paths = await selectedFilePaths(io, { id, root, tree, selectionTree, inputs: check.inputs, selectedPaths: selected.paths });
    if (paths.length === 0) return { id, kind, ...forecast, outcome: "not selected", reason: "no files to check" };
  }
  if (request.dryRun) forecast = resolveCheckForecast(check, root, paths, io.platform);
  if (usesFormingWorktree(check, request)) {
    tree = resolved.tree = resolved.worktreeTree ?? tree;
  }
  const divergent = await readCheckDivergence(io.git, root, tree, resolved.worktreeTree ?? tree, check.inputs);
  const result = await executeSelectedCheck({ id, check, root, tree, paths, kind, definition, indexViews, divergent, selectionTree, coordinates: resolved, ...(check.mode === "files" ? { content: { base: resolved.base, tree, merged: resolved.merged } } : {}) }, io, request);
  if (result.outcome === "failed" || result.outcome === "couldn't run") {
    result.remedy = checkRetryCommand({ id, request, resolved, widenedFiles: usesWidenedFileRetry(check, selection, request) });
  }
  return { ...result, ...forecast };
}

function usesFormingWorktree(check: CheckDeclaration["checks"][string], request: CheckRequest): boolean {
  return check.fixes && request.form.kind !== "pre-commit" && checkFixesAllowed(request);
}

function isSkippedHookCheck(request: CheckRequest, id: string): boolean {
  return isCheckHookForm(request.form) && request.skip?.includes(id) === true;
}

function usesWidenedFileRetry(check: CheckDeclaration["checks"][string], selection: CheckSelection, request: CheckRequest): boolean {
  return check.mode === "files" && check.widen && selection.widened && request.form.kind !== "run";
}

async function partiallyStagedRefusal(io: DeclaredCheckDependencies, context: {
  root: string; request: CheckRequest; entries: Array<[string, CheckDeclaration["checks"][string]]>;
  coordinates: ResolvedCheckRequest; selection: CheckSelection;
}): Promise<string | undefined> {
  const { root, request, entries, coordinates: resolved, selection } = context;
  if (request.form.kind !== "pre-commit") return undefined;
  const candidates: Array<{ id: string; inputs: string[] }> = [];
  for (const [id, check] of entries) {
    if (request.skip?.includes(id)) continue;
    const selected = selectCheckInputs({ id, check, request, resolved, selection });
    if (selected.status === "not selected") continue;
    if (check.mode === "files" && (await selectedFilePaths(io, { id, root, tree: resolved.tree, selectionTree: resolved.tree,
      inputs: check.inputs, selectedPaths: selected.paths })).length === 0) continue;
    candidates.push({ id, inputs: check.inputs });
  }
  const affected = await findPartiallyStagedChecks(io, root,
    { base: resolved.base, tree: resolved.tree, worktree: resolved.worktreeTree ?? resolved.tree }, candidates);
  if (affected.length === 0) return undefined;
  const paths = [...new Set(affected.flatMap(check => check.paths))].map(path => JSON.stringify(path)).join(", ");
  const ids = affected.map(check => check.id).join(",");
  return `Partially staged inputs: ${paths} (checks: ${ids}). Stage each whole file and retry git commit, or skip these checks for this commit with ARC_SKIP=${ids} git commit ... .`;
}

async function selectedFilePaths(io: DeclaredCheckDependencies, input: {
  id: string; root: string; tree: string; selectionTree: string; inputs: string[]; selectedPaths?: TreePathChange[];
}): Promise<string[]> {
  const { id, root, tree, selectionTree, inputs, selectedPaths } = input;
  const matching = selectedPaths === undefined ? await matchTreeInputs(io, root, selectionTree, inputs)
    : { status: "known" as const, paths: selectedPaths };
  if (matching.status !== "known") throw new Error(`Could not resolve inputs for ${id}; retry the check request.`);
  const paths = matching.paths.filter(path => path.newMode !== "000000").map(path => path.path);
  if (tree === selectionTree || paths.length === 0) return paths;
  const current = await matchTreeInputs(io, root, tree, inputs);
  if (current.status !== "known") throw new Error(`Could not resolve current inputs for ${id}; retry the check request.`);
  const present = new Set(current.paths.map(path => path.path));
  return paths.filter(path => present.has(path));
}

interface SelectedCheck {
  selectionTree: string;
  id: string;
  check: CheckDeclaration["checks"][string];
  root: string;
  tree: string;
  paths: string[];
  content?: CheckContentContext;
  indexViews: CheckIndexViews;
  divergent: string[];
  coordinates: ResolvedCheckRequest;
  kind: CheckResultKind;
  definition: CheckDeclaration;
}

async function selectedCheckKey(selected: SelectedCheck, io: DeclaredCheckDependencies, tree = selected.tree) {
  const { id, check, root, paths, content, definition, divergent } = selected;
  return divergent.length > 0 ? null : resolveCheckKey(io, { id, check, root, tree, paths, definition,
    base: content?.base, merged: content?.merged });
}

async function executeSelectedCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest): Promise<DeclaredCheckResult> {
  const { id, check, root, paths, content, kind, indexViews } = selected;
  const key = await selectedCheckKey(selected, io);
  const pass = key === null || request.force ? null : await io.passes.get(key, id);
  if (pass !== null) return { id, kind, outcome: "reused", output: pass.output };
  if (request.dryRun) return { id, kind, outcome: "would run" };
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const cwd = resolve(root, check.root);
  const argumentsFromRoot = checkFileArguments(root, cwd, paths, io.platform);
  const indexFile = check.reads_index ? await indexViews.get() : undefined;
  const startedAt = (io.now ?? performance.now.bind(performance))();
  const result = await executeCheckBatches(io, { command, paths: argumentsFromRoot, cwd, content, check, indexFile });
  const costMs = Math.max(0, (io.now ?? performance.now.bind(performance))() - startedAt);
  const measurement = await io.reports?.save(id, result.output, costMs);
  return { ...await finalizeCheckRun(selected, io, request, result, key), costMs,
    ...(measurement ? { logPath: measurement.logPath } : {}) };
}

async function finalizeCheckRun(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  result: { started: boolean; exitCode: number; output: string }, key: string | null): Promise<DeclaredCheckResult> {
  const { id, kind, check, coordinates } = selected;
  const { rewritten, reason } = await finishCheckRewrites(selected, io, request);
  const { divergent } = selected;
  const details = { ...(divergent.length > 0 ? { divergent } : {}), ...(check.fixes ? { rewritten } : {}), output: result.output };
  if (!result.started) return { id, kind, ...details, outcome: "couldn't run" };
  if (reason !== undefined) return { id, kind, ...details, outcome: "failed", reason };
  if (result.exitCode !== 0) return { id, kind, ...details, outcome: "failed" };
  const producedKey = rewritten.length > 0 ? await selectedCheckKey(selected, io, coordinates.tree) : key;
  if (producedKey !== null) await io.passes.put({ schemaVersion: 1, id, key: producedKey, outcome: "passed", output: result.output });
  return { id, kind, ...details, outcome: "passed" };
}

async function finishCheckRewrites(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest): Promise<{ rewritten: string[]; reason?: string }> {
  const { check, root, coordinates } = selected;
  if (!check.fixes) return { rewritten: [] };
  const hook = request.form.kind === "pre-commit";
  const rewritten = await refreshFixerContent(io.git, root, coordinates,
    !hook && request.form.kind !== "pre-push" && (coordinates.scope.kind !== "staged" || checkFixesAllowed(request)));
  if (rewritten.length === 0) return { rewritten };
  if (!checkFixesAllowed(request)) return { rewritten, reason: "rewrote files during verification" };
  if (!hook) return { rewritten };
  const indexFile = await selected.indexViews.get();
  if (selected.definition.commit_fixes === "fail" || request.hookFixesFail
    || !await commitRestageAllowed(io.git, root, indexFile)) {
    return { rewritten, reason: "rewrote files; stage the rewrites and retry git commit" };
  }
  try {
    coordinates.tree = await restageCommitFixes(io, root, { base: coordinates.base, tree: selected.selectionTree, rewritten }, indexFile);
    selected.divergent = await readCheckDivergence(io.git, root, coordinates.tree, coordinates.worktreeTree ?? coordinates.tree, check.inputs);
    return { rewritten };
  } catch (error) {
    return { rewritten, reason: `Could not restage fixer rewrites: ${String(error)}. Repair the index, stage the rewrites, and retry git commit.` };
  }
}

async function executeCheckBatches(io: DeclaredCheckDependencies, input: {
  command: readonly string[]; paths: string[]; cwd: string; content?: CheckContentContext; check: CheckDeclaration["checks"][string]; indexFile?: string;
}) {
  const { command, paths, cwd, content, check, indexFile } = input;
  const outputs: string[] = [];
  let exitCode = 0;
  try {
    const batches = check.mode === "files" ? batchCheckPaths(command, paths, io.platform) : [[]];
    for (const batch of batches) {
      const result = await io.execute([...command, ...batch], cwd, content, { shell: check.shell, indexFile });
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
