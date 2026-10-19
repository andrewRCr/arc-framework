/** Store-backed decomposition context with closed legacy and Git boundaries. */
import type { DecomposeContext } from "../../src/lib/decompose/context.js";
import type { Store } from "../../src/lib/store/contract.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

/** Keep read and record-write tests from reaching checkout or legacy state adapters. */
export function decomposeContext(store: Store): DecomposeContext {
  const forbidden = async (): Promise<never> => { throw new Error("Unexpected checkout or legacy lifecycle operation."); };
  return { identity: "test-user", cohortTemplate: "# Cohort: `{cohort-name}`\n\n**Parent:** {Parent}\n\n**Purpose:** {Purpose}\n",
    baseBranch: "main", executor: { store, exec: scriptGitExec([]).exec, cwd: "/repo",
      indexFs: { readdir: forbidden, readFile: forbidden }, setPhase: forbidden, relocateArtifacts: forbidden,
      reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden, writeSoftFields: forbidden,
      writeBranchField: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden } };
}
