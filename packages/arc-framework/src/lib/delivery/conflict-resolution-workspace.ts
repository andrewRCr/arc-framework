/** Deterministic detached workspaces for attended delivery conflict resolution. */

import { isAbsolute, join, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import {
  DeliveryPlanV1Schema,
  type DeliveryPlanV1,
} from "./schema.js";

export type DeliveryConflictResolutionWorkspaceObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | {
      readonly status: "refused";
      readonly reason: "path-collision" | "unavailable" | "attached" | "dirty";
    };

/**
 * Derive one deterministic ARC-owned detached conflict-resolution workspace.
 *
 * @param input - Canonical plan, member identity, and absolute Git-common directory.
 * @returns Exact workspace path or a closed refusal for malformed authority.
 */
export function deriveDeliveryResolutionWorkspacePath(input: {
  readonly plan: DeliveryPlanV1;
  readonly deliverableId: string;
  readonly gitCommonDir: string;
}):
  | { readonly status: "derived"; readonly path: string }
  | {
      readonly status: "refused";
      readonly reason: "plan-invalid" | "git-common-dir-invalid" | "member-unavailable";
    } {
  const parsed = DeliveryPlanV1Schema.safeParse(input.plan);
  if (!parsed.success) return { status: "refused", reason: "plan-invalid" };
  if (!isAbsolute(input.gitCommonDir)) return { status: "refused", reason: "git-common-dir-invalid" };
  const member = parsed.data.members.find(({ deliverableId }) => deliverableId === input.deliverableId);
  if (member === undefined) return { status: "refused", reason: "member-unavailable" };
  return {
    status: "derived",
    path: join(
      resolve(input.gitCommonDir),
      "arc",
      "delivery-resolutions",
      parsed.data.planId,
      member.chunkKey,
    ),
  };
}

/**
 * Observe only the registered checkout at one exact resolution-workspace path.
 *
 * @param input - Git boundary, exact path, and filesystem existence probe.
 * @returns Exact clean detached checkout facts, exact absence, or a refusal that preserves the path.
 */
export async function observeDeliveryResolutionWorkspace(input: {
  readonly exec: GitExec;
  readonly path: string;
  readonly pathExists: (path: string) => Promise<boolean>;
}): Promise<DeliveryConflictResolutionWorkspaceObservation> {
  if (!isAbsolute(input.path)) return { status: "refused", reason: "path-collision" };
  const expectedPath = resolve(input.path);
  const roster = await scanRegisteredWorktrees(input.exec);
  if (!roster.ok) return { status: "refused", reason: "unavailable" };
  let exists: boolean;
  try {
    exists = await input.pathExists(expectedPath);
  } catch {
    return { status: "refused", reason: "unavailable" };
  }
  const registered = roster.worktrees.find((worktree) => resolve(worktree.path) === expectedPath);
  if (registered === undefined) {
    return exists
      ? { status: "refused", reason: "path-collision" }
      : { status: "absent" };
  }
  if (!exists) return { status: "refused", reason: "unavailable" };
  if (!registered.detached || registered.branch !== null) {
    return { status: "refused", reason: "attached" };
  }
  try {
    const { stdout } = await input.exec(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: expectedPath },
    );
    return stdout === ""
      ? { status: "observed", head: registered.head }
      : { status: "refused", reason: "dirty" };
  } catch {
    return { status: "refused", reason: "unavailable" };
  }
}

/**
 * Remove one exact clean detached resolution workspace, adopting exact absence on retry.
 *
 * @param input - Git boundary, derived path, expected head, and existence probe.
 * @returns Exact removal/adoption or a refusal that never force-removes a foreign checkout.
 */
export async function removeDeliveryResolutionWorkspace(input: {
  readonly exec: GitExec;
  readonly path: string;
  readonly expectedHead: string;
  readonly pathExists: (path: string) => Promise<boolean>;
}): Promise<
  | { readonly status: "removed" | "adopted" }
  | {
      readonly status: "refused";
      readonly reason:
        | "path-collision"
        | "unavailable"
        | "attached"
        | "dirty"
        | "head-mismatch"
        | "remove-failed";
    }
> {
  const before = await observeDeliveryResolutionWorkspace(input);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "adopted" };
  if (before.head !== input.expectedHead) return { status: "refused", reason: "head-mismatch" };
  try {
    await input.exec("git", ["worktree", "remove", "--", resolve(input.path)]);
  } catch {
    const afterFailure = await observeDeliveryResolutionWorkspace(input);
    return afterFailure.status === "absent"
      ? { status: "adopted" }
      : { status: "refused", reason: "remove-failed" };
  }
  const after = await observeDeliveryResolutionWorkspace(input);
  return after.status === "absent"
    ? { status: "removed" }
    : { status: "refused", reason: "remove-failed" };
}
