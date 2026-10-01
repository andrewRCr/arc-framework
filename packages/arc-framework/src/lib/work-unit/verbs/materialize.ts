/**
 * Cross-machine WU materialize.
 *
 * The remote branch carries the authoritative active work-unit artifacts. The
 * command layer proves that branch is remote-only on this machine and fetches it;
 * this operation then places it in a checkout without changing lifecycle state.
 *
 * @module
 */

import {
  type ExecuteTransitionContext,
  type TransitionInputs,
} from "../lifecycle-executor.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";

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
      /** The materialized branch. */
      branch: string;
      /** Whether the materialize landed in the current checkout. */
      inPlace: boolean;
      /** Exact checkout allocated for the fetched branch. */
      worktreePath: string;
      /** Provisioning notices surfaced by the placement primitive. */
      advisories: string[];
    };

/** Remote-tracking branch ref used as the base for a fresh materialize spawn. */
function remoteBranch(branch: string): string {
  return `origin/${branch}`;
}

/**
 * Run materialize: place a fetched remote-only WU branch either in this checkout
 * (`--here`) or in a fresh worktree. Candidate discovery already established the
 * cross-machine fact: no local branch or worktree exists for the fetched remote
 * branch. A backlog record on the local base is expected and does not participate
 * in placement authority.
 *
 * @param ctx - The executor seams.
 * @param params - The target WU and branch placement mode.
 * @returns A rejection, or the materialized branch.
 */
export async function runMaterialize(
  ctx: Pick<ExecuteTransitionContext, "guardValidators" | "reconcileWorkUnitWorktree">,
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

  const worktreeOp: NonNullable<TransitionInputs["worktreeOp"]> = params.inPlace
    ? { mutation: "spawn", inPlace: true, branch, wuName: name, createBranch: false }
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
      };
  const inputs: TransitionInputs = {
    worktreeOp,
    materializesCurrentCheckout: params.inPlace === true,
  };

  const occupancy = ctx.guardValidators?.["worktree-occupancy"];
  if (occupancy === undefined) {
    return { status: "rejected", reason: "guard `worktree-occupancy` is not wired." };
  }
  // The occupancy guard's shared lifecycle signature carries an index, but this
  // placement check reads only the entering checkout. Keep backlog/storage
  // projection entirely outside materialize authority.
  const emptyIndex: LifecycleIndex = new Map();

  try {
    const guardResult = await occupancy({
      index: emptyIndex,
      slug: name,
      position: null,
      inputs,
    });
    if (!guardResult.ok) return { status: "rejected", reason: guardResult.message };

    const placement = await ctx.reconcileWorkUnitWorktree(worktreeOp);
    if (placement.mutation !== "spawn") {
      return { status: "rejected", reason: "materialize placement returned an unexpected operation." };
    }
    return {
      status: "materialized",
      branch,
      inPlace: params.inPlace === true,
      worktreePath: placement.worktreePath,
      advisories: placement.postCreateNotice === undefined ? [] : [placement.postCreateNotice],
    };
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
