/** Exact private candidate-gate preparation for one registered delivery correction. */

import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { observeDeliveryEligibilityRef } from "./git-eligibility.js";

export interface DeliveryReviewFixCandidateCoordinates {
  readonly head: string;
  readonly tree: string;
}

export type DeliveryReviewFixCandidateObservation =
  | ({ readonly status: "observed" } & DeliveryReviewFixCandidateCoordinates)
  | { readonly status: "absent" }
  | { readonly status: "refused"; readonly reason: string };

const OPERATION_MARKERS = [
  "MERGE_HEAD",
  "REBASE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
] as const;

/** Observe one exact registered gate only when it is safe for machine rematerialization. */
export async function observeDeliveryReviewFixCandidateGate(input: {
  readonly exec: GitExec;
  readonly path: string;
  readonly pathExists: (path: string) => Promise<boolean>;
}): Promise<DeliveryReviewFixCandidateObservation> {
  if (!isAbsolute(input.path)) return { status: "refused", reason: "path-collision" };
  const expectedPath = resolve(input.path);
  const roster = await scanRegisteredWorktrees(input.exec);
  if (!roster.ok) return { status: "refused", reason: "topology-unavailable" };
  let exists: boolean;
  try {
    exists = await input.pathExists(expectedPath);
  } catch {
    return { status: "refused", reason: "path-unavailable" };
  }
  const matches = roster.worktrees.filter(({ path }) => resolve(path) === expectedPath);
  if (matches.length === 0) {
    return exists
      ? { status: "refused", reason: "path-collision" }
      : { status: "absent" };
  }
  const registered = matches[0];
  if (matches.length !== 1 || registered === undefined || !exists) {
    return { status: "refused", reason: "topology-ambiguous" };
  }
  if (!registered.detached || registered.branch !== null) {
    return { status: "refused", reason: "attached" };
  }
  try {
    const { stdout } = await input.exec(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: expectedPath },
    );
    if (stdout !== "") return { status: "refused", reason: "dirty" };
    const operationPaths = await Promise.all(OPERATION_MARKERS.map(async (marker) => {
      const resolved = await input.exec(
        "git",
        ["rev-parse", "--path-format=absolute", "--git-path", marker],
        { cwd: expectedPath },
      );
      return resolved.stdout.trim();
    }));
    for (const operationPath of operationPaths) {
      if (operationPath === "" || await input.pathExists(operationPath)) {
        return { status: "refused", reason: "operation-in-progress" };
      }
    }
  } catch {
    return { status: "refused", reason: "observation-unavailable" };
  }
  const coordinates = await observeDeliveryEligibilityRef(
    (command, args, options) => input.exec(command, args, { ...options, cwd: expectedPath }),
    "HEAD",
  );
  return coordinates !== null && coordinates.head === registered.head
    ? { status: "observed", ...coordinates }
    : { status: "refused", reason: "head-mismatch" };
}

type CandidateRewriteResult =
  | { readonly status: "rewritten" | "adopted" }
  | { readonly status: "refused"; readonly reason: string };

type GateResetResult =
  | { readonly status: "reset" }
  | { readonly status: "refused"; readonly reason: string };

type PairCreationResult =
  | { readonly status: "created" | "adopted" }
  | { readonly status: "refused"; readonly reason: string };

export interface DeliveryReviewFixCandidateGatePreparationPorts {
  readonly observeGate: () => Promise<DeliveryReviewFixCandidateObservation>;
  readonly observeCandidate: () => Promise<DeliveryReviewFixCandidateObservation>;
  readonly rewriteCandidate: (input: {
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<CandidateRewriteResult>;
  readonly resetGate: (input: {
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<GateResetResult>;
  readonly createPair: (coordinates: DeliveryReviewFixCandidateCoordinates) => Promise<PairCreationResult>;
}

export type DeliveryReviewFixCandidateGatePreparationResult =
  | { readonly status: "rematerialized" }
  | { readonly status: "already-rematerialized"; readonly replayed: true }
  | { readonly status: "refused"; readonly reason: string };

/** Reset one already-proved clean detached gate, restoring its prior head on failure. */
export async function resetDeliveryReviewFixCandidateGate(input: {
  readonly exec: GitExec;
  readonly path: string;
  readonly beforeHead: string;
  readonly requestedHead: string;
}): Promise<GateResetResult> {
  try {
    await input.exec("git", ["reset", "--hard", input.requestedHead], { cwd: input.path });
    return { status: "reset" };
  } catch {
    try {
      await input.exec("git", ["reset", "--hard", input.beforeHead], { cwd: input.path });
    } catch {
      return { status: "refused", reason: "rollback-failed" };
    }
    return { status: "refused", reason: "reset-failed" };
  }
}

/** Create one previously absent deterministic candidate ref and detached gate. */
export async function createDeliveryReviewFixCandidatePair(input: {
  readonly exec: GitExec;
  readonly ref: string;
  readonly path: string;
  readonly coordinates: DeliveryReviewFixCandidateCoordinates;
  readonly ensureParent: (path: string) => Promise<void>;
}): Promise<PairCreationResult> {
  const zero = "0".repeat(input.coordinates.head.length);
  try {
    await input.ensureParent(input.path);
    await input.exec("git", ["update-ref", input.ref, input.coordinates.head, zero]);
  } catch {
    return { status: "refused", reason: "create-ref-failed" };
  }
  try {
    await input.exec(
      "git",
      ["worktree", "add", "--detach", "--", input.path, input.ref],
    );
    return { status: "created" };
  } catch {
    try {
      await input.exec("git", ["update-ref", "-d", input.ref, input.coordinates.head]);
    } catch {
      return { status: "refused", reason: "create-rollback-failed" };
    }
    return { status: "refused", reason: "create-gate-failed" };
  }
}

function coordinatesMatch(
  observed: DeliveryReviewFixCandidateObservation,
  expected: DeliveryReviewFixCandidateCoordinates,
): boolean {
  return observed.status === "observed"
    && observed.head === expected.head
    && observed.tree === expected.tree;
}

/**
 * Prepare one exact private candidate ref and detached gate for correction authoring.
 *
 * The observation ports admit only clean, detached, operation-free gates. This
 * coordinator owns no canonical ref, remote, Delivery State, or review effect.
 */
export async function prepareDeliveryReviewFixCandidateGate(
  input: {
    readonly before: DeliveryReviewFixCandidateCoordinates;
    readonly current: DeliveryReviewFixCandidateCoordinates;
  },
  ports: DeliveryReviewFixCandidateGatePreparationPorts,
): Promise<DeliveryReviewFixCandidateGatePreparationResult> {
  const [gate, candidate] = await Promise.all([
    ports.observeGate(),
    ports.observeCandidate(),
  ]);
  if (gate.status === "refused") {
    return { status: "refused", reason: `candidate-gate-${gate.reason}` };
  }
  if (candidate.status === "refused") {
    return { status: "refused", reason: `candidate-ref-${candidate.reason}` };
  }
  if (gate.status === "absent" || candidate.status === "absent") {
    if (gate.status !== "absent" || candidate.status !== "absent") {
      return { status: "refused", reason: "candidate-pair-split" };
    }
    const created = await ports.createPair(input.current);
    if (created.status === "refused") {
      return { status: "refused", reason: `candidate-pair-${created.reason}` };
    }
  } else if (coordinatesMatch(gate, input.current) && coordinatesMatch(candidate, input.current)) {
    return { status: "already-rematerialized", replayed: true };
  } else {
    if (!coordinatesMatch(gate, input.before) || !coordinatesMatch(candidate, input.before)) {
      return { status: "refused", reason: "candidate-pair-moved" };
    }
    const rewritten = await ports.rewriteCandidate({
      beforeHead: input.before.head,
      requestedHead: input.current.head,
    });
    if (rewritten.status === "adopted") {
      return { status: "refused", reason: "candidate-ref-raced" };
    }
    if (rewritten.status === "refused") {
      return { status: "refused", reason: `candidate-ref-${rewritten.reason}` };
    }
    const reset = await ports.resetGate({
      beforeHead: input.before.head,
      requestedHead: input.current.head,
    });
    if (reset.status === "refused") {
      const rollback = await ports.rewriteCandidate({
        beforeHead: input.current.head,
        requestedHead: input.before.head,
      });
      if (rollback.status === "refused") {
        return { status: "refused", reason: "candidate-pair-rollback-failed" };
      }
      return { status: "refused", reason: `candidate-gate-${reset.reason}` };
    }
  }

  const [preparedGate, preparedCandidate] = await Promise.all([
    ports.observeGate(),
    ports.observeCandidate(),
  ]);
  return coordinatesMatch(preparedGate, input.current)
      && coordinatesMatch(preparedCandidate, input.current)
    ? { status: "rematerialized" }
    : { status: "refused", reason: "candidate-pair-postcondition" };
}
