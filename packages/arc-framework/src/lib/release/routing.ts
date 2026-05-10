/**
 * Release-wrapper routing classification.
 *
 * Status envelopes resolve this once from the final release-enabled and
 * interlock settings so downstream workflows and skills consult a structured
 * class result instead of repeating authorization logic at each fire site.
 *
 * @module
 */

/** Route selected for a workflow or task fire site. */
export type ReleaseRoute = "wrapper" | "raw";

/** Inputs captured alongside the route result for diagnostics. */
export interface ReleaseRoutingRationale {
  releaseEnabled: boolean;
  commitInterlock: string;
  pushInterlock: string;
}

/** Resolved routing decision for every release-wrapper fire-site class. */
export interface ReleaseRoutingValue {
  taskCommit: ReleaseRoute;
  workflowCommit: ReleaseRoute;
  workflowPush: ReleaseRoute;
  rationale: ReleaseRoutingRationale;
}

/** Status-envelope slot shape for the release-routing probe. */
export type ReleaseRoutingSlot =
  | { ok: true; value: ReleaseRoutingValue }
  | { ok: false; error: { kind: "runtime"; message: string } };

export interface ResolveReleaseRoutingOptions {
  releaseEnabled: boolean;
  commitInterlock: string;
  pushInterlock: string;
}

/**
 * Resolve route classes from the final release-enabled flag and interlock
 * values. Unknown interlock values safe-default to raw for forward
 * compatibility.
 *
 * @param opts - Final release-enabled flag and interlock values
 * @returns Routing decisions plus the input rationale snapshot
 */
export function resolveReleaseRouting(
  opts: ResolveReleaseRoutingOptions,
): ReleaseRoutingValue {
  const taskCommit: ReleaseRoute = opts.releaseEnabled
      && (opts.commitInterlock === "on-task-approval" || opts.commitInterlock === "on-workflow")
    ? "wrapper"
    : "raw";
  const workflowCommit: ReleaseRoute = opts.releaseEnabled && opts.commitInterlock === "on-workflow"
    ? "wrapper"
    : "raw";
  const workflowPush: ReleaseRoute = opts.releaseEnabled && opts.pushInterlock === "on-workflow"
    ? "wrapper"
    : "raw";

  return {
    taskCommit,
    workflowCommit,
    workflowPush,
    rationale: {
      releaseEnabled: opts.releaseEnabled,
      commitInterlock: opts.commitInterlock,
      pushInterlock: opts.pushInterlock,
    },
  };
}
