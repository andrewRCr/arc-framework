/**
 * Local history completeness for graph-derived proof.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** Local history completeness or an unavailable prerequisite inspection. */
export type HistoryCompletenessResult =
  | { kind: "complete" }
  | { kind: "shallow" }
  | { kind: "unavailable"; reason: "execution" | "malformed" };

/** Inputs for {@link readHistoryCompleteness}. */
export interface ReadHistoryCompletenessOptions {
  /** Injectable Git executor. */
  exec: GitExec;
  /** Repository root, when ambient process state must not select the repository. */
  cwd?: string;
}

/** Inspect whether local graph history is complete. */
export async function readHistoryCompleteness(
  options: ReadHistoryCompletenessOptions,
): Promise<HistoryCompletenessResult> {
  let stdout: string;
  try {
    ({ stdout } = await options.exec(
      "git",
      ["rev-parse", "--is-shallow-repository"],
      options.cwd === undefined ? undefined : { cwd: options.cwd },
    ));
  } catch {
    return { kind: "unavailable", reason: "execution" };
  }
  if (stdout === "false") return { kind: "complete" };
  if (stdout === "true") return { kind: "shallow" };
  return { kind: "unavailable", reason: "malformed" };
}

/** Whether the local-history prerequisite permits a proof class. */
export function historyAllowsProof(
  history: HistoryCompletenessResult,
  proof: "non-traversal" | "graph",
): boolean {
  return proof === "non-traversal" || history.kind === "complete";
}
