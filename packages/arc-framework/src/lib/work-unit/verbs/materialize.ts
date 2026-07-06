/**
 * Cross-machine WU materialize.
 *
 * A materialized work unit has no local lifecycle record before the transition:
 * the remote branch carries its authoritative `active/` meta. The command layer
 * fetches that branch first, then this verb supplies only the worktree placement
 * operands to the lifecycle executor.
 *
 * @module
 */

import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { isSlugSafe } from "../slug.js";

/** Default spawned materialize — create a local branch from `origin/<branch>` in a fresh worktree. */
export interface MaterializeSpawnParams {
  /** WU name. */
  name: string;
  /** Remote branch short name, e.g. `feat/demo`. */
  branch: string;
  /** Fresh-worktree placement (the default). */
  inPlace?: false;
  /** Resolved `worktree.location_template` — where the materialized worktree lands. */
  locationTemplate: string;
  /** Main-worktree basename — the `{repo}` expansion. */
  repo: string;
  /** Identity materializing the WU — the worktree ownership marker. */
  spawningIdentity: string;
  /** Project-supplied post-create provisioning script, run inside the new worktree when configured. */
  postCreateScript?: string;
  /** Resolved primary checkout path; source for registered harness-dir copy. */
  primaryWorktreePath?: string;
  /** Comma-separated registered harness dirs to copy from the primary checkout. */
  registeredHarnessDirs?: string;
}

/** In-place materialize — check out the fetched remote branch in the current checkout. */
export interface MaterializeInPlaceParams {
  /** WU name. */
  name: string;
  /** Remote branch short name, e.g. `feat/demo`. */
  branch: string;
  /** Re-attach in the current worktree — no fresh worktree. */
  inPlace: true;
}

/** The operational inputs a materialize supplies. */
export type MaterializeParams = MaterializeSpawnParams | MaterializeInPlaceParams;

/** The outcome of a materialize attempt. */
export type MaterializeResult =
  | { status: "rejected"; reason: string }
  | {
      status: "materialized";
      outcome: TransitionOutcome;
      /** The materialized branch. */
      branch: string;
      /** Whether the materialize landed in the current checkout. */
      inPlace: boolean;
    };

/** Remote-tracking branch ref used as the base for a fresh materialize spawn. */
function remoteBranch(branch: string): string {
  return `origin/${branch}`;
}

/**
 * Run materialize: place a fetched remote-only WU branch either in this checkout
 * (`--here`) or in a fresh worktree. The executor's source index remains local:
 * a local record for the slug means this is not a remote-only pickup and the
 * `materialize@null` edge will reject.
 *
 * @param ctx - The executor seams.
 * @param params - The target WU and branch placement mode.
 * @returns A rejection, or the materialized branch.
 */
export async function runMaterialize(
  ctx: ExecuteTransitionContext,
  params: MaterializeParams,
): Promise<MaterializeResult> {
  const { name, branch } = params;
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`materialize` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }
  if (branch.trim() === "") {
    return { status: "rejected", reason: "`materialize` requires a remote branch." };
  }

  const inputs: TransitionInputs = {
    worktreeOp: params.inPlace
      ? { mutation: "spawn", inPlace: true, branch, createBranch: false }
      : {
          mutation: "spawn",
          branch,
          createBranch: true,
          base: remoteBranch(branch),
          locationTemplate: params.locationTemplate,
          repo: params.repo,
          wuName: name,
          spawningIdentity: params.spawningIdentity,
          postCreateScript: params.postCreateScript,
          primaryWorktreePath: params.primaryWorktreePath,
          registeredHarnessDirs: params.registeredHarnessDirs,
        },
    materializesCurrentCheckout: params.inPlace === true,
  };

  const outcome = await executeTransition(ctx, { verb: "materialize", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "materialized", outcome, branch, inPlace: params.inPlace === true };
}
