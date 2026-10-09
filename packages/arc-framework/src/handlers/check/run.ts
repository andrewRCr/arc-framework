/** Orchestration for declared repository check requests. */
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import type { TreeMatchIO } from "../../lib/checks/matching.js";
import { matchTreeInputs, selectChangedInputs } from "../../lib/checks/matching.js";
import { stagedWorktreeTree } from "../../lib/checks/tree.js";
import { checkContentKey } from "../../lib/checks/key.js";
import type { CheckPassStore } from "../../lib/checks/record.js";

/** One check's externally observable result. */
export interface DeclaredCheckResult {
  id: string;
  kind: "deadline" | "feedback";
  outcome: "passed" | "failed" | "not selected" | "reused";
  output?: string;
  reason?: string;
}

/** Typed result retained independently of output formatting. */
export type RunDeclaredChecksResult = {
  kind: "result";
  exitCode: 0 | 1;
  result: { status: "completed" | "none declared"; checks: DeclaredCheckResult[]; base?: string; tree?: string };
} | { kind: "error"; exitCode: 2; error: { kind: "invalid" | "refused"; message: string } };

/** Repository and command boundaries injected into check orchestration. */
export interface DeclaredCheckDependencies extends TreeMatchIO {
  passes: CheckPassStore;
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string): Promise<{ exitCode: number; output: string }>;
}

/**
 * Run the increment-boundary request over repository content.
 * @param root - Resolved repository root
 * @param io - Injectable repository and command boundaries
 * @param options - Whether selected checks must execute despite reusable passes
 * @returns Named outcomes and the request's exit status
 */
export async function runCheckIncrement(root: string, io: DeclaredCheckDependencies, options: { force?: boolean } = {}): Promise<RunDeclaredChecksResult> {
  return runCommitChecks(root, io, options, false);
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
  return runCommitChecks(root, io, options, true);
}

async function runCommitChecks(
  root: string, io: DeclaredCheckDependencies, options: { force?: boolean; indexFile?: string }, staged: boolean,
): Promise<RunDeclaredChecksResult> {
  const declaration = await io.readDeclaration(root);
  if (declaration.status === "invalid") return { kind: "error", exitCode: 2,
    error: { kind: "invalid", message: `${declaration.location}: ${declaration.message}` } };
  if (declaration.status === "absent") return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } };
  const entries = Object.entries(declaration.value.checks).filter(([, check]) => check.gate === "commit" && !check.ci_only);
  if (entries.length === 0) return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } };
  const tree = staged ? (await io.git("git", ["write-tree"], { cwd: root, indexFile: options.indexFile })).stdout
    : await stagedWorktreeTree(io.git, root);
  const checks: DeclaredCheckResult[] = [];
  for (const [id, check] of entries) {
    const selected = await selectChangedInputs(io.git, root, "HEAD", tree, check.inputs);
    if (selected.status === "not selected") {
      checks.push({ id, kind: "deadline", outcome: "not selected", reason: selected.reason });
      continue;
    }
    let paths: string[] = [];
    if (check.mode === "files") {
      const matching = selected.status === "selected" ? { status: "known" as const, paths: selected.paths }
        : await matchTreeInputs(io, root, tree, check.inputs);
      if (matching.status !== "known") throw new Error(`Could not resolve inputs for ${id}; retry arc check increment.`);
      paths = matching.paths.filter(path => path.newMode !== "000000").map(path => path.path);
      if (paths.length === 0) {
        checks.push({ id, kind: "deadline", outcome: "not selected", reason: "no files to check" });
        continue;
      }
    }
    checks.push(await executeSelectedCheck({ id, check, root, tree, paths }, io, options.force === true));
  }
  return { kind: "result", exitCode: checks.some(check => check.outcome === "failed") ? 1 : 0,
    result: { status: "completed", checks, base: "HEAD", tree } };
}


interface SelectedCheck {
  id: string;
  check: CheckDeclaration["checks"][string];
  root: string;
  tree: string;
  paths: string[];
}

async function executeSelectedCheck(
  { id, check, root, tree, paths }: SelectedCheck, io: DeclaredCheckDependencies, force: boolean,
): Promise<DeclaredCheckResult> {
  const inputs = check.cache ? await matchTreeInputs(io, root, tree, check.inputs) : null;
  const key = inputs?.status === "known" ? checkContentKey({ id, declaration: check, inputs: inputs.paths,
    ...(check.mode === "files" ? { paths } : {}) }) : null;
  const pass = key === null || force ? null : await io.passes.get(key, id);
  if (pass !== null) return { id, kind: "deadline", outcome: "reused", output: pass.output };
  const command = typeof check.command === "string" ? [check.command] : check.command;
  const result = await io.execute([...command, ...paths], root);
  if (result.exitCode === 0 && key !== null) {
    await io.passes.put({ schemaVersion: 1, id, key, outcome: "passed", output: result.output });
  }
  return { id, kind: "deadline", outcome: result.exitCode === 0 ? "passed" : "failed", output: result.output };
}
