/** Prepare an exact retained branch generation for transient materialization. */

import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { uniqueRefToken } from "../git/ref-tree.js";

/** Inputs for preparing a retained remote branch at its recorded local generation. */
export interface PrepareMaterializedBranchOptions {
  readonly exec: GitExec;
  readonly remote: string;
  readonly branch: string;
  readonly expectedHead: string;
  readonly existingLocal?: "refuse" | "accept-exact";
}

/** Stable refusal classification independent of operator-facing prose. */
export type MaterializedBranchRefusalCode =
  | "local-branch-exists"
  | "local-head-mismatch"
  | "remote-branch-missing"
  | "remote-head-mismatch";

/** Observable outcome of exact-generation branch preparation. */
export type PrepareMaterializedBranchResult =
  | {
      readonly kind: "prepared";
      readonly localRef: string;
      readonly expectedHead: string;
      readonly remoteHead: string;
      readonly created: boolean;
    }
  | { readonly kind: "refused"; readonly code: MaterializedBranchRefusalCode; readonly reason: string }
  | { readonly kind: "error"; readonly stage: MaterializedBranchStage; readonly message: string };

/** The Git probe a preparation failure reached, named in the reported error code. */
type MaterializedBranchStage = "cleanup" | "fetch" | "local-branch" | "local-head" | "remote-head";

/**
 * Fetch a retained branch and create its local ref at the exact recorded head.
 *
 * @param options - Remote branch coordinates and the immutable retained head.
 * @returns Prepared local-ref evidence, an unsafe-state refusal, or an operational error.
 */
export async function prepareMaterializedBranch(
  options: PrepareMaterializedBranchOptions,
): Promise<PrepareMaterializedBranchResult> {
  const localRef = `refs/heads/${options.branch}`;
  const localCheck = ["show-ref", "--verify", "--quiet", localRef];
  try {
    await options.exec("git", localCheck);
    if (options.existingLocal !== "accept-exact") {
      return {
        kind: "refused",
        code: "local-branch-exists",
        reason: `Local branch '${options.branch}' already exists.`,
      };
    }
    const localHeadArgs = ["rev-parse", "--verify", `${localRef}^{commit}`];
    try {
      const localHead = (await options.exec("git", localHeadArgs)).stdout.trim();
      return localHead === options.expectedHead
        ? {
            kind: "prepared",
            localRef,
            expectedHead: options.expectedHead,
            remoteHead: localHead,
            created: false,
          }
        : {
            kind: "refused",
            code: "local-head-mismatch",
            reason: `Local branch '${options.branch}' moved from the recorded head.`,
          };
    } catch (error) {
      return failure("local-head", normalizeGitRejection(error, { command: "git", args: localHeadArgs }));
    }
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: localCheck });
    if (normalized.exitCode !== 1) return failure("local-branch", normalized);
  }

  const snapshotRef = `refs/arc/tmp/transient-materialize/${uniqueRefToken()}`;
  const outcome = await prepareFromSnapshot(options, localRef, snapshotRef);
  try {
    await options.exec("git", ["update-ref", "-d", snapshotRef]);
  } catch (error) {
    if (outcome.kind !== "prepared") return outcome;
    await options.exec("git", ["update-ref", "-d", localRef, options.expectedHead]).catch(() => undefined);
    return failure("cleanup", normalizeGitRejection(error, {
      command: "git",
      args: ["update-ref", "-d", snapshotRef],
    }));
  }
  return outcome;
}

async function prepareFromSnapshot(
  options: PrepareMaterializedBranchOptions,
  localRef: string,
  snapshotRef: string,
): Promise<PrepareMaterializedBranchResult> {
  const fetchArgs = ["fetch", "--", options.remote, `+refs/heads/${options.branch}:${snapshotRef}`];
  try {
    await options.exec("git", fetchArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: fetchArgs });
    return normalized.expectedOutcome === "absent-remote-ref"
      ? {
          kind: "refused",
          code: "remote-branch-missing",
          reason: `Remote branch '${options.branch}' does not exist.`,
        }
      : failure("fetch", normalized);
  }

  let remoteHead: string;
  const resolveArgs = ["rev-parse", "--verify", `${snapshotRef}^{commit}`];
  try {
    remoteHead = (await options.exec("git", resolveArgs)).stdout.trim();
  } catch (error) {
    return failure("remote-head", normalizeGitRejection(error, { command: "git", args: resolveArgs }));
  }

  if (remoteHead !== options.expectedHead) {
    return {
      kind: "refused",
      code: "remote-head-mismatch",
      reason: "The remote branch moved from the exact recorded head.",
    };
  }

  const createArgs = ["update-ref", localRef, options.expectedHead, "0".repeat(40)];
  try {
    await options.exec("git", createArgs);
  } catch (error) {
    return failure("local-branch", normalizeGitRejection(error, { command: "git", args: createArgs }));
  }
  return {
    kind: "prepared",
    localRef,
    expectedHead: options.expectedHead,
    remoteHead,
    created: true,
  };
}

function failure(stage: MaterializedBranchStage, error: Error): Extract<PrepareMaterializedBranchResult, { kind: "error" }> {
  return { kind: "error", stage, message: error.message };
}
