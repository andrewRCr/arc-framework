/** Orchestration for declared repository check requests. */
import { tmpdir } from "node:os";
import type { RawGitExec } from "../../lib/git/exec.js";
import { createExecaRawGitExec } from "../../lib/git/process-executor.js";
import { matchPathList, type PathListSelection } from "../../lib/checks/path-list.js";
import { readProjectedSelection, requestProjectedSelection, type ProjectedSelectionReader } from "../../lib/checks/projected-selection.js";
import type { PushRefDisposition } from "../../lib/checks/push.js";
import { resolve } from "node:path";
import { checkArgumentBatches, checkFileArguments } from "../../lib/checks/batching.js";
import { resolveCheckFileCoordinates, type CheckFileCoordinates } from "../../lib/checks/file-coordinates.js";
import { readCheckDivergence } from "../../lib/checks/divergence.js";
import { findPartiallyStagedChecks } from "../../lib/checks/partial-staging.js";
import { commitRestageAllowed, restageCommitFixes } from "../../lib/checks/commit-fixes.js";
import { checkFixesAllowed, refreshFixerContent } from "../../lib/checks/fixers.js";
import { type TreePathChange, createWorktreeSnapshot, stagedWorktreeTree } from "../../lib/checks/tree.js";
import { createCheckIndexDirectory, createCheckIndexViews, type CheckIndexViews } from "../../lib/checks/index-view.js";
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import { matchTreeInputs } from "../../lib/checks/matching.js";
import { resolveCheckRequest, type ResolvedCheckRequest } from "../../lib/checks/resolve-request.js";
import { readRangeMergedInPaths } from "../../lib/checks/merged.js";
import { resolveCheckKey, resolveCheckKeyMaterial, type CheckKeyIO } from "../../lib/checks/key-resolver.js";
import { CI_ONLY_UNSELECTED_REASON, resolveCheckSelection, selectCheckInputs, type CheckSelection } from "../../lib/checks/selection.js";
import { isCheckHookForm, type CheckRequest } from "../../lib/checks/request.js";
import { selectIncrementDeferredChecks, selectRequestChecks, checkResultKind, type CheckResultKind } from "../../lib/checks/gates.js";
import type { CheckPassStore, CheckPassWrite } from "../../lib/checks/record.js";
import type { CheckReportStore } from "../../lib/checks/reports.js";
import { checkVerification } from "./report.js";
import { checkRetryCommand } from "../../lib/checks/remedies.js";
import { findUninstalledLockedPackages, installGapReason } from "../../lib/checks/install-gap.js";
import { resolveCheckForecast, type CheckForecast } from "../../lib/checks/forecast.js";
import type { CheckContentContext } from "../../lib/checks/environment-policy.js";
import { bindCapturedEnvironment, captureEnvironmentInputs, type CapturedEnvironmentInputs } from "../../lib/checks/environment-inputs.js";
import { readMachineCheckRunner, type MachineCheckRunnerConfiguration } from "../../lib/checks/runner/machine-config.js";
import { prepareSelectedCheckExecution, type PreparedCheckExecution, type CheckExecutionClosure,
  type CheckExecutionPreparation } from "../../lib/checks/runner/execution.js";
import { retainedRunnerRemedy } from "./runner-recovery.js";
import { composePreparedCheckKey } from "../../lib/checks/runner/key.js";
import { normalizeCheckInvocationOutcome, reduceCheckInvocationOutcomes,
  type CheckInvocationReduction, type NormalizedCheckInvocationOutcome } from "../../lib/checks/result.js";

/** Whether a fresh pass was kept for later gates; a pass with no content key has nothing to keep. */
export type DeclaredCheckRecord = CheckPassWrite | { status: "not-recordable" };

/** One check's externally observable result. */
export interface DeclaredCheckResult extends Partial<CheckForecast> {
  id: string;
  kind: CheckResultKind;
  outcome: "passed" | "failed" | "no evidence" | "couldn't run" | "not selected" | "reused" | "would run" | "skipped";
  output?: string;
  reason?: string;
  /** One line the check's command reported about its run, such as where it ran. */
  notice?: string;
  divergent?: string[];
  rewritten?: string[];
  /** Files a range's file check left unchecked because a merge on the range brought them in unchanged from the base. */
  mergedIn?: string[];
  logPath?: string;
  costMs?: number;
  lastCostMs?: number;
  remedy?: string;
  /** Provider settlement and repair instructions remain visible in CI reports. */
  remedyKind?: "runner";
  record?: DeclaredCheckRecord;
}

/** Typed result retained independently of output formatting. */
export type RunDeclaredChecksResult = {
  kind: "result";
  exitCode: 0 | 1 | 2;
  result: { status: "completed" | "none declared"; checks: DeclaredCheckResult[]; verification?: string; ci?: boolean; base?: string; tree?: string; merged?: string[]; ignoredSkips?: string[]; pushRefs?: PushRefDisposition[] };
} | { kind: "error"; exitCode: 2; error: { kind: "invalid" | "refused"; message: string }
  | { kind: "usage"; code: string; message: string } };

/**
 * Classify a request from all named outcomes, with unavailable execution taking precedence. A check that found
 * nothing to examine produced no evidence, so it never lets the request succeed.
 * @param checks - Every included check outcome
 * @returns Success, failure, or unavailable-execution exit status
 */
export function declaredChecksExitCode(checks: readonly DeclaredCheckResult[]): 0 | 1 | 2 {
  if (checks.some(check => check.outcome === "couldn't run")) return 2;
  return checks.some(check => check.outcome === "failed" || check.outcome === "no evidence") ? 1 : 0;
}

/** Repository and command boundaries injected into check orchestration. */
export interface DeclaredCheckDependencies extends CheckKeyIO {
  rawGit?: RawGitExec;
  readProjectedSelection?: ProjectedSelectionReader;
  platform: NodeJS.Platform;
  availableParallelism(): number;
  passes: CheckPassStore;
  reports?: CheckReportStore;
  now?(): number;
  captureEnvironment?: typeof captureEnvironmentInputs;
  readRunnerConfiguration?: typeof readMachineCheckRunner;
  prepareExecution?: typeof prepareSelectedCheckExecution;
  interrupted?(): boolean;
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string, content?: CheckContentContext, policy?: { shell: boolean; indexFile?: string; environment?: NodeJS.ProcessEnv }): Promise<{ started: boolean; exitCode: number; output: string; notice?: string; notRunReason?: string }>;
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
  const outcome = reportDeferredPushChecks(await resolveAndRunRequest(root, io, request, declaration, entries), available, request);
  return outcome.kind === "result" && ignoredSkips.length > 0
    ? { ...outcome, result: { ...outcome.result, ignoredSkips } } : outcome;
}

const PUSH_GATE_DEFERRED = "runs at the push gate";

/**
 * Name each push-gate check an increment leaves unrun, so its report shows the push gate went untested.
 * @param outcome - The request's executed result
 * @param available - Declared entries in declaration order
 * @param request - Form and CI policy
 * @returns The result with each left-out push check as not selected, in declaration order
 */
function reportDeferredPushChecks(outcome: RunDeclaredChecksResult, available: CheckDeclaration["checks"],
  request: CheckRequest): RunDeclaredChecksResult {
  const deferred = selectIncrementDeferredChecks(available, request.form);
  if (outcome.kind === "error" || deferred.length === 0) return outcome;
  const order = Object.keys(available);
  const checks = [...outcome.result.checks, ...deferred.map(([id, check]): DeclaredCheckResult => ({
    id, kind: checkResultKind(request.form, check), outcome: "not selected",
    reason: check.ci_only && !request.ci ? CI_ONLY_UNSELECTED_REASON : PUSH_GATE_DEFERRED,
  }))].sort((first, second) => order.indexOf(first.id) - order.indexOf(second.id));
  return { ...outcome, result: { ...outcome.result, status: "completed", checks,
    verification: checkVerification("completed", checks) } };
}

async function resolveAndRunRequest(
  root: string, io: DeclaredCheckDependencies, request: CheckRequest,
  declaration: Exclude<TypedFileResult<CheckDeclaration>, { status: "invalid" }>,
  entries: Array<[string, CheckDeclaration["checks"][string]]>,
): Promise<RunDeclaredChecksResult> {
  const scratch = entries.some(([, check]) => check.reads_index) ? await createCheckIndexDirectory(io.git, root) : undefined;
  const snapshotDirectory = scratch?.directory ?? (entries.some(([, check]) => check.fixes) ? tmpdir() : undefined);
  try {
    const resolved = await resolveCheckRequest(io.git, root, request, snapshotDirectory);
    if (resolved.status === "refused") return { kind: "error", exitCode: 2, error: { kind: "refused", message: resolved.message } };
    const indexViews = createCheckIndexViews(io.git, root, request, resolved.request);
    try {
      return await executeResolvedRequest(root, io, request, declaration, entries, resolved.request, indexViews);
    } finally {
      await indexViews.remove();
      await resolved.request.snapshot?.remove();
    }
  } finally {
    await scratch?.remove();
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
  const projected: PathListSelection = entries.some(([, check]) => check.mode === "selection")
    ? await requestProjectedSelection(io.readProjectedSelection ?? readProjectedSelection, root, request)
    : { status: "ok", paths: [] };
  const refusal = await partiallyStagedRefusal(io, { root, request, entries, coordinates, selection, globalInputs: declaration.value.global_inputs });
  if (refusal !== undefined) return { kind: "error", exitCode: 2, error: { kind: "refused", message: refusal } };
  const jobs = entries.map(([id, check], position) => ({ id, check, position }));
  const outcomes: Array<{ position: number; result: DeclaredCheckResult }> = [];
  const run = async ({ id, check, position }: (typeof jobs)[number]) => {
    const result = await runRequestedCheck({ id, check, root, projected, resolved: coordinates, selection, selectionTree: tree, indexViews, definition: declaration.value, kind: checkResultKind(request.form, check) }, io, request);
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


interface RequestedCheck {
  selectionTree: string;
  indexViews: CheckIndexViews;
  definition: CheckDeclaration;
  kind: CheckResultKind;
  id: string;
  check: CheckDeclaration["checks"][string];
  root: string;
  resolved: ResolvedCheckRequest;
  selection: CheckSelection;
  projected: PathListSelection;
}

async function runRequestedCheck(context: RequestedCheck,
  io: DeclaredCheckDependencies, request: CheckRequest,
): Promise<DeclaredCheckResult> {
  const { id, check, kind } = context;
  if (isSkippedHookCheck(request, id)) return { id, kind, outcome: "skipped", reason: "ARC_SKIP" };
  return check.mode === "selection" ? runProjectedCheck(context, io, request) : runGitCheck(context, io, request);
}

async function runGitCheck(context: RequestedCheck, io: DeclaredCheckDependencies,
  request: CheckRequest): Promise<DeclaredCheckResult> {
  const { id, check, root, resolved, selection, kind, definition, indexViews, selectionTree } = context;
  let { tree } = resolved;
  let executed = check;
  let forecast = request.dryRun ? resolveCheckForecast(check, root, [], io.platform) : {};
  const selected = selectCheckInputs({ id, check, request, resolved, selection });
  if (selected.status === "not selected") return { id, kind, ...forecast, outcome: "not selected", reason: selected.reason };
  let paths: string[] = [];
  let mergedIn: string[] = [];
  if (check.mode === "files") {
    const run = await selectFilesRun(context, io, request, selected.paths);
    if (run.status === "not selected") return { id, kind, ...forecast, outcome: "not selected", reason: run.reason,
      ...(run.mergedIn === undefined ? {} : { mergedIn: run.mergedIn }) };
    ({ paths, mergedIn, check: executed } = run);
  }
  if (request.dryRun) forecast = await forecastSelectedCheck(executed, root, paths, io.platform);
  if (usesFormingWorktree(check, request)) {
    tree = resolved.tree = resolved.worktreeTree ?? tree;
  }
  const divergent = await readCheckDivergence(io.git, root, tree, resolved.worktreeTree ?? tree, check.inputs, definition.global_inputs);
  const result = await executeSelectedCheck({ id, check: executed, root, tree, paths, kind, definition, indexViews, divergent, selectionTree, coordinates: resolved, ...(check.mode === "files" ? { content: { base: resolved.base, tree, merged: resolved.merged } } : {}) }, io, request, forecast);
  if (result.outcome === "failed" || result.outcome === "couldn't run") {
    const retry = checkRetryCommand({ id, request, resolved, widenedFiles: usesWidenedFileRetry(check, selection, request) });
    result.remedy = result.remedy === undefined ? retry : `${result.remedy} Then run ${retry}`;
  }
  if (mergedIn.length > 0) result.mergedIn = mergedIn;
  return result;
}

type FilesRun = { status: "run"; paths: string[]; mergedIn: string[]; check: CheckDeclaration["checks"][string] }
  | { status: "not selected"; reason: string; mergedIn?: string[] };

/**
 * Choose the paths a files check runs over once merged-in paths leave. A check that selects deletions, when deletions
 * are all the change made itself, runs once without paths, as a check that withholds its paths does.
 */
async function selectFilesRun(context: RequestedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  selectedPaths: TreePathChange[] | undefined): Promise<FilesRun> {
  const { id, check, root, resolved, selectionTree } = context;
  const fileSelection = { id, root, tree: resolved.tree, selectionTree, inputs: check.inputs, selectedPaths };
  let executed = check;
  let selection = await leaveMergedIn(context, io, request,
    await selectedFilePaths(io, { ...fileSelection, withDeletions: !check.pass_paths }));
  if (selection.paths.length === 0 && check.mode === "files" && check.select_deletions) {
    selection = await leaveMergedIn(context, io, request, await selectedFilePaths(io, { ...fileSelection, withDeletions: true }));
    executed = { ...check, pass_paths: false };
  }
  const { examined, paths, mergedIn } = selection;
  if (examined.length === 0) return { status: "not selected", reason: "no files to check" };
  return paths.length === 0 ? { status: "not selected", reason: MERGED_IN_ONLY, mergedIn }
    : { status: "run", paths, mergedIn, check: executed };
}

/** Leave out of one file selection the files a base merge on the range brought in unchanged. */
async function leaveMergedIn(context: RequestedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  examined: string[]): Promise<{ examined: string[]; paths: string[]; mergedIn: string[] }> {
  const { check, root, resolved } = context;
  if (examined.length === 0) return { examined, paths: [], mergedIn: [] };
  const tree = usesFormingWorktree(check, request) ? resolved.worktreeTree ?? resolved.tree : resolved.tree;
  const mergedIn = await readRangeMergedInPaths(io.git, root, { scope: resolved.scope, base: resolved.base,
    merges: resolved.merges, remoteBase: resolved.remoteBase, tree, inputs: check.inputs, paths: examined });
  const left = new Set(mergedIn);
  return { examined, paths: examined.filter(path => !left.has(path)), mergedIn };
}

async function runProjectedCheck(context: RequestedCheck, io: DeclaredCheckDependencies,
  request: CheckRequest): Promise<DeclaredCheckResult> {
  const { id, kind, check, root, projected, resolved } = context;
  const forecast = request.dryRun ? resolveCheckForecast(check, root, [], io.platform) : {};
  const remedy = checkRetryCommand({ id, request, resolved, widenedFiles: false, selection: true });
  if (projected.status === "unavailable") return { id, kind, ...forecast, outcome: "couldn't run", reason: projected.reason, remedy };
  const scope = resolved.scope;
  const candidates = scope.kind === "paths" ? projected.paths.filter(path => scope.paths.some(name =>
    name === "." || path === name || path.startsWith(`${name}/`))) : projected.paths;
  const selected = await matchPathList({ git: io.rawGit ?? createExecaRawGitExec(root) }, root, candidates, check.inputs);
  if (selected.status === "unavailable") return { id, kind, ...forecast, outcome: "couldn't run", reason: selected.reason, remedy };
  const paths = [...selected.paths];
  if (paths.length === 0) return { id, kind, ...forecast, outcome: "not selected", reason: "no files to check" };
  const result = await executeSelectedCheck({ ...context, tree: resolved.tree, paths,
    divergent: [], coordinates: resolved }, io, request, request.dryRun ? await forecastSelectedCheck(check, root, paths, io.platform) : {});
  if (result.outcome === "failed" || result.outcome === "couldn't run") result.remedy = remedy;
  return result;
}

async function forecastSelectedCheck(check: CheckDeclaration["checks"][string], root: string,
  paths: string[], platform: NodeJS.Platform): Promise<CheckForecast> {
  if (paths.length === 0 || !check.pass_paths) return resolveCheckForecast(check, root, paths, platform);
  const coordinates = await nativeFileCoordinates(root, resolve(root, check.root));
  return resolveCheckForecast(check, root, paths, platform, coordinates);
}

async function nativeFileCoordinates(root: string, cwd: string): Promise<CheckFileCoordinates> {
  try {
    return await resolveCheckFileCoordinates(root, cwd);
  } catch {
    // Preserve native spawn failures and dry-run descriptions for an unavailable working directory.
    return { root, cwd };
  }
}

const MERGED_IN_ONLY = "every changed file was merged in unchanged";

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
  coordinates: ResolvedCheckRequest; selection: CheckSelection; globalInputs: string[];
}): Promise<string | undefined> {
  const { root, request, entries, coordinates: resolved, selection } = context;
  if (request.form.kind !== "pre-commit") return undefined;
  const candidates: Array<{ id: string; inputs: string[] }> = [];
  for (const [id, check] of entries) {
    if (request.skip?.includes(id)) continue;
    const selected = selectCheckInputs({ id, check, request, resolved, selection });
    if (selected.status === "not selected") continue;
    if (check.mode === "files" && (await selectedFilePaths(io, { id, root, tree: resolved.tree, selectionTree: resolved.tree,
      inputs: check.inputs, selectedPaths: selected.paths, withDeletions: !check.pass_paths || check.select_deletions })).length === 0) continue;
    candidates.push({ id, inputs: check.inputs });
    if (context.globalInputs.length > 0) candidates.push({ id, inputs: context.globalInputs });
  }
  const affected = await findPartiallyStagedChecks(io, root,
    { base: resolved.base, tree: resolved.tree, worktree: resolved.worktreeTree ?? resolved.tree,
      mergePaths: resolved.mergePaths, mergePathsUnresolved: resolved.mergePathsUnresolved }, candidates);
  if (affected.length === 0) return undefined;
  const paths = [...new Set(affected.flatMap(check => check.paths))].map(path => JSON.stringify(path)).join(", ");
  const ids = [...new Set(affected.map(check => check.id))].join(",");
  return `Partially staged inputs: ${paths} (checks: ${ids}). Stage each whole file and retry git commit, or skip these checks for this commit with ARC_SKIP=${ids} git commit ... .`;
}

/**
 * The changed input paths that select a files check. A deleted path cannot be handed to a command, so it counts only
 * for a check that withholds its paths, which any change to its inputs selects, or one that selects deletions and so
 * runs without paths when deletions are all that changed.
 */
async function selectedFilePaths(io: DeclaredCheckDependencies, input: {
  id: string; root: string; tree: string; selectionTree: string; inputs: string[]; selectedPaths?: TreePathChange[];
  withDeletions: boolean;
}): Promise<string[]> {
  const { id, root, tree, selectionTree, inputs, selectedPaths } = input;
  const matching = selectedPaths === undefined ? await matchTreeInputs(io, root, selectionTree, inputs)
    : { status: "known" as const, paths: selectedPaths };
  if (matching.status !== "known") throw new Error(`Could not resolve inputs for ${id}; retry the check request.`);
  if (input.withDeletions) return matching.paths.map(path => path.path);
  const paths = matching.paths.filter(path => path.newMode !== "000000").map(path => path.path);
  if (tree === selectionTree || paths.length === 0) return paths;
  const current = await matchTreeInputs(io, root, tree, inputs);
  if (current.status !== "known") throw new Error(`Could not resolve current inputs for ${id}; retry the check request.`);
  const present = new Set(current.paths.map(path => path.path));
  return paths.filter(path => present.has(path));
}

interface SelectedCheck {
  routed?: boolean;
  environmentIdentity?: string;
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
    base: content?.base, merged: content?.merged, environmentIdentity: selected.environmentIdentity });
}

async function executeSelectedCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  forecast: Partial<CheckForecast>): Promise<DeclaredCheckResult> {
  const { id, kind } = selected;
  if (io.interrupted?.()) return { id, kind, ...forecast, outcome: "couldn't run", reason: "Check request was interrupted before dispatch; retry explicitly with a fresh request." };
  const runner = await (io.readRunnerConfiguration ?? readMachineCheckRunner)(selected.check);
  if (runner !== undefined) {
    // The runner plans its own portable invocations, so native batches and shards would misdescribe a routed dry run.
    const routed: Partial<CheckForecast> = { ...forecast };
    delete routed.batches;
    delete routed.shards;
    return { ...await executeRoutedSelectedCheck(selected, io, request, runner), ...routed };
  }
  return { ...await executeNativeInputsCheck(selected, io, request), ...forecast };
}

async function executeNativeInputsCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest): Promise<DeclaredCheckResult> {
  const { id, kind } = selected;
  if (Object.keys(selected.check.environment_inputs).length === 0) return executeNativeSelectedCheck(selected, io, request);
  if (request.dryRun) return { id, kind, outcome: "would run" };
  let capture: CapturedEnvironmentInputs;
  try {
    capture = await (io.captureEnvironment ?? captureEnvironmentInputs)(selected.check.environment_inputs, resolve(selected.root, selected.check.root));
  } catch (error) {
    return { id, kind, outcome: "couldn't run", reason: error instanceof Error ? error.message : String(error) };
  }
  const bound = bindNativeEnvironment(io, capture);
  const executed = await executeNativeSelectedCheck({ ...selected, environmentIdentity: capture.identity }, bound, request).then(
    result => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  const cleanup = await capture.dispose().then(() => undefined, (error: unknown) => error instanceof Error ? error.message : String(error));
  if (!executed.ok) throw executed.error;
  if (cleanup === undefined) return executed.result;
  return { ...executed.result, notice: [executed.result.notice, cleanup].filter(Boolean).join("; ") };
}

async function executeRoutedSelectedCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  configuration: MachineCheckRunnerConfiguration): Promise<DeclaredCheckResult> {
  const { id, kind, check, root, tree, paths, definition, content } = selected;
  if (request.dryRun) return { id, kind, outcome: "would run",
    reason: "Routed reuse requires preparation; this dry run does not prepare or probe the configured runner." };
  const outputs: Buffer[] = [];
  const startedAt = (io.now ?? performance.now.bind(performance))();
  const prepared = await (io.prepareExecution ?? prepareSelectedCheckExecution)({ callerRoot: root,
    request: selected.coordinates, check, paths, configuration, globalRuntimeInputs: definition.global_runtime_inputs,
    onOutput: output => { outputs.push(Buffer.from(output.bytes)); },
    onDiagnostic: bytes => { outputs.push(Buffer.from(bytes)); } });
  if (prepared.status !== "ready") return unpreparedRoutedCheck(selected, configuration, prepared);
  const execution = prepared.execution;
  let closing: Promise<CheckExecutionClosure> | undefined;
  const close = () => closing ??= execution.close();
  try {
    const material = selected.divergent.length > 0 || execution.runtime === undefined ? null
      : await resolveCheckKeyMaterial({ ...io, capturedSource: { root: execution.source.root, index: execution.sourceIndex } },
        { id, check, root, tree, paths, definition, base: content?.base, merged: content?.merged });
    const key = composePreparedCheckKey(material, execution);
    const pass = key === null || request.force ? null : await io.passes.get(key, id);
    if (pass !== null) {
      const closure = await close();
      return closure.status === "closed" ? { id, kind, outcome: "reused", output: pass.output,
        ...(closure.cleanupWarning === undefined ? {} : { notice: closure.cleanupWarning }) }
        : { id, kind, outcome: "couldn't run", reason: closure.reason, remedy: retainedRunnerRemedy(closure.retained), remedyKind: "runner" };
    }
    const result = await executeRoutedSingles(execution, check);
    const closure = await close();
    return await finalizeRoutedCheck(selected, io, request,
      { result, closure, output: Buffer.concat(outputs).toString("utf8"), key, startedAt });
  } finally { await close(); }
}

/** Attribute a refused or uncertain preparation to the caller's inputs or the configured runner. */
function unpreparedRoutedCheck(selected: SelectedCheck, configuration: MachineCheckRunnerConfiguration,
  prepared: Exclude<CheckExecutionPreparation, { status: "ready" }>): DeclaredCheckResult {
  const { id, kind } = selected;
  const runnerReason = `${configuration.file}: checks.runner: ${prepared.reason}`;
  if (prepared.status === "uncertain") {
    return { id, kind, outcome: "couldn't run", reason: runnerReason, remedy: retainedRunnerRemedy(prepared.retained), remedyKind: "runner" };
  }
  return { id, kind, outcome: "couldn't run", reason: prepared.origin === "inputs" ? prepared.reason : runnerReason,
    ...(prepared.cleanupWarning === undefined ? {} : { notice: prepared.cleanupWarning }), remedy: prepared.remedy, remedyKind: "runner" };
}

async function executeRoutedSingles(execution: PreparedCheckExecution, check: SelectedCheck["check"]): Promise<CheckInvocationReduction> {
  const outcomes: NormalizedCheckInvocationOutcome[] = [];
  const incomplete: string[] = [];
  try {
    for (const invocation of execution.plan.invocations) {
      const result = await execution.run(invocation.id);
      outcomes.push(normalizeCheckInvocationOutcome(result.outcomes.get(invocation.id), check.no_evidence_exit));
      if (result.status === "incomplete") { incomplete.push(result.reason); break; }
    }
  } catch (cause) { incomplete.push(String(cause)); }
  return reduceCheckInvocationOutcomes(outcomes, check.no_evidence_exit, incomplete);
}

async function finalizeRoutedCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  observed: { result: CheckInvocationReduction; closure: CheckExecutionClosure; output: string; key: string | null; startedAt: number }): Promise<DeclaredCheckResult> {
  const { result, closure, output, key, startedAt } = observed;
  const costMs = Math.max(0, (io.now ?? performance.now.bind(performance))() - startedAt);
  const measurement = await io.reports?.save(selected.id, output, costMs);
  const finalized = await finalizeCheckRun({ ...selected, routed: true }, io, request,
    { evidence: result, output, incompleteWork: closure.status === "uncertain" ? [closure.reason] : [] }, key);
  const notice = [...result.notices, closure.status === "closed" ? closure.cleanupWarning : undefined].filter(Boolean).join("; ");
  const remedy = closure.status === "uncertain" ? retainedRunnerRemedy(closure.retained)
    : finalized.outcome === "couldn't run" && result.remedies.length > 0 ? result.remedies.join(" ") : undefined;
  return { ...finalized, costMs,
    ...(remedy === undefined ? {} : { remedy, remedyKind: "runner" as const }),
    ...(measurement === undefined ? {} : { logPath: measurement.logPath }), ...(notice ? { notice } : {}) };
}

function bindNativeEnvironment(io: DeclaredCheckDependencies, capture: CapturedEnvironmentInputs): DeclaredCheckDependencies {
  const environment = () => bindCapturedEnvironment(capture.bindings, process.env, io.platform);
  return { ...io,
    runtime: (command, cwd) => io.runtime(command, cwd, environment()),
    execute: (command, cwd, content, policy) => io.execute(command, cwd, content,
      { ...policy, shell: policy?.shell ?? false, environment: environment() }),
  };
}

async function executeNativeSelectedCheck(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest): Promise<DeclaredCheckResult> {
  const { id, check, root, paths, content, kind, indexViews } = selected;
  const key = await selectedCheckKey(selected, io);
  const pass = key === null || request.force ? null : await io.passes.get(key, id);
  if (pass !== null) return { id, kind, outcome: "reused", output: pass.output };
  if (request.dryRun) return { id, kind, outcome: "would run" };
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const cwd = resolve(root, check.root);
  const coordinates = paths.length > 0 && check.pass_paths ? await nativeFileCoordinates(root, cwd) : { root, cwd };
  const argumentsFromRoot = checkFileArguments(coordinates.root, coordinates.cwd, paths, io.platform);
  const indexFile = check.reads_index ? await indexViews.get() : undefined;
  const startedAt = (io.now ?? performance.now.bind(performance))();
  const result = await executeCheckBatches(io, { command, paths: argumentsFromRoot, cwd, content, check, indexFile });
  const costMs = Math.max(0, (io.now ?? performance.now.bind(performance))() - startedAt);
  const measurement = await io.reports?.save(id, result.output, costMs);
  return { ...await finalizeCheckRun(selected, io, request, result, key), costMs,
    ...(result.notice === undefined ? {} : { notice: result.notice }),
    ...(measurement ? { logPath: measurement.logPath } : {}) };
}

async function finalizeCheckRun(selected: SelectedCheck, io: DeclaredCheckDependencies, request: CheckRequest,
  result: { evidence: CheckInvocationReduction; output: string; incompleteWork?: readonly string[] }, key: string | null): Promise<DeclaredCheckResult> {
  const { id, kind, check, coordinates } = selected;
  const { rewritten, reason } = await finishCheckRewrites(selected, io, request);
  const { divergent } = selected;
  const evidence = result.evidence;
  const incomplete = [...evidence.incomplete, ...(result.incompleteWork ?? [])].join("; ");
  const details = { ...(divergent.length > 0 ? { divergent } : {}), ...(check.fixes ? { rewritten } : {}), output: result.output,
    ...(incomplete ? { reason: incomplete } : {}) };
  if (evidence.kind !== "failure" && (evidence.kind === "unavailable" || incomplete)) {
    return { id, kind, ...details, outcome: "couldn't run", reason: incomplete || "A required invocation could not complete." };
  }
  if (reason !== undefined) return { id, kind, ...details, outcome: "failed", reason: [reason, incomplete].filter(Boolean).join("; ") };
  const gap = selected.routed ? undefined : await installGap(selected, { exitCode: evidence.exitCode, output: result.output });
  if (gap !== undefined) return { id, kind, ...details, outcome: "couldn't run", reason: gap };
  if (evidence.kind === "no-evidence") return { id, kind, ...details, outcome: "no evidence" };
  if (evidence.kind === "failure") return { id, kind, ...details, outcome: "failed" };
  const producedKey = rewritten.length > 0 ? await selectedCheckKey(selected, io, coordinates.tree) : key;
  const record: DeclaredCheckRecord = producedKey === null ? { status: "not-recordable" }
    : await io.passes.put({ schemaVersion: 1, id, key: producedKey, outcome: "passed", output: result.output });
  return { id, kind, ...details, outcome: "passed", record };
}

/** A check that failed for want of a package its npm lockfile declares could not run; name the install to repair. */
async function installGap(selected: SelectedCheck, result: { exitCode: number; output: string }): Promise<string | undefined> {
  const { check, root } = selected;
  if (result.exitCode === 0 || result.exitCode === check.no_evidence_exit) return undefined;
  const missing = await findUninstalledLockedPackages(result.output, [...new Set([resolve(root, check.root), root])]);
  return missing.length === 0 ? undefined : installGapReason(missing);
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
    coordinates.tree = await restageCommitFixes(io, root, { base: coordinates.base, tree: selected.selectionTree, rewritten,
      mergePaths: coordinates.mergePaths, mergePathsUnresolved: coordinates.mergePathsUnresolved }, indexFile);
    selected.divergent = await readCheckDivergence(io.git, root, coordinates.tree, coordinates.worktreeTree ?? coordinates.tree, check.inputs, selected.definition.global_inputs);
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
  const outcomes: NormalizedCheckInvocationOutcome[] = [];
  try {
    const batches = checkArgumentBatches(check, command, paths, io.platform);
    for (const batch of batches) {
      const result = await io.execute([...command, ...batch], cwd, content, { shell: check.shell, indexFile });
      if (result.output) outputs.push(result.output);
      // A terminal interrupt also reaches native children, so their status no longer describes a complete run.
      if (io.interrupted?.()) {
        outcomes.push({ kind: "unavailable", reason: "Check request was interrupted while this check ran; retry explicitly with a fresh request." });
        break;
      }
      outcomes.push(normalizeCheckInvocationOutcome(result.started ? { ...result, status: "completed" }
        : { status: "unavailable", reason: result.notRunReason ?? "Check process did not start.", notice: result.notice }, check.no_evidence_exit));
      if (!result.started || result.notRunReason !== undefined) break;
    }
  } catch (error) {
    outputs.push(String(error));
    outcomes.push(normalizeCheckInvocationOutcome({ status: "unavailable", reason: String(error) }, check.no_evidence_exit));
  }
  const evidence = reduceCheckInvocationOutcomes(outcomes, check.no_evidence_exit);
  return { evidence, output: outputs.join("\n"),
    ...(evidence.notices.length === 0 ? {} : { notice: evidence.notices.join("; ") }) };
}
