/** Orchestration for declared repository check requests. */
import type { CheckDeclaration } from "../../lib/checks/declaration.js";
import type { TypedFileResult } from "../../lib/config/typed-file-reader.js";
import type { TreeMatchIO } from "../../lib/checks/matching.js";
import { matchTreeInputs, selectChangedInputs } from "../../lib/checks/matching.js";
import { stagedWorktreeTree } from "../../lib/checks/tree.js";

/** One check's externally observable result. */
export interface DeclaredCheckResult {
  id: string;
  kind: "deadline" | "feedback";
  outcome: "passed" | "failed" | "not selected";
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
  readDeclaration(root: string): Promise<TypedFileResult<CheckDeclaration>>;
  execute(command: readonly string[], root: string): Promise<{ exitCode: number; output: string }>;
}

/**
 * Run the increment-boundary request over repository content.
 * @param root - Resolved repository root
 * @param io - Injectable repository and command boundaries
 * @returns Named outcomes and the request's exit status
 */
export async function runCheckIncrement(root: string, io: DeclaredCheckDependencies): Promise<RunDeclaredChecksResult> {
  const declaration = await io.readDeclaration(root);
  if (declaration.status === "invalid") return { kind: "error", exitCode: 2,
    error: { kind: "invalid", message: `${declaration.location}: ${declaration.message}` } };
  if (declaration.status === "absent") return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } };
  const entries = Object.entries(declaration.value.checks).filter(([, check]) => check.gate === "commit" && !check.ci_only);
  if (entries.length === 0) return { kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } };
  const tree = await stagedWorktreeTree(io.git, root);
  const checks: DeclaredCheckResult[] = [];
  for (const [id, check] of entries) {
    const selected = await selectChangedInputs(io.git, root, "HEAD", tree, check.inputs);
    if (selected.status === "not selected") {
      checks.push({ id, kind: "deadline", outcome: "not selected", reason: selected.reason });
      continue;
    }
    const command = typeof check.command === "string" ? [check.command] : check.command;
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
    const result = await io.execute([...command, ...paths], root);
    checks.push({ id, kind: "deadline", outcome: result.exitCode === 0 ? "passed" : "failed", output: result.output });
  }
  return { kind: "result", exitCode: checks.some(check => check.outcome === "failed") ? 1 : 0,
    result: { status: "completed", checks, base: "HEAD", tree } };
}
