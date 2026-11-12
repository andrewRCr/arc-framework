/** Deterministic locators and crash-safe cleanup for completed delivery residue. */

import { isAbsolute, join, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import type { CanonicalDigest } from "../kernel/index.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import {
  reserveDeliveryOperation,
  validateDeliveryActiveOperation,
} from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import {
  DeliveryPlanV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

export interface DeliveryResidueLocator {
  readonly deliverableId: CanonicalDigest;
  readonly candidateRef: string;
  readonly gatePath: string;
}

export type DeliveryCandidateObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | { readonly status: "refused"; readonly reason?: string };

export type DeliveryRefreshCandidateObservation =
  | {
      readonly status: "observed";
      readonly candidates: readonly { readonly ref: string; readonly head: string }[];
    }
  | { readonly status: "refused"; readonly reason?: string };

export type DeliveryGateCheckoutObservation =
  | { readonly status: "absent" }
  | { readonly status: "observed"; readonly head: string }
  | {
      readonly status: "refused";
      readonly reason: "path-collision" | "unavailable" | "attached" | "dirty";
    };

type ExactDeleteResult =
  | { readonly status: "deleted" | "removed" | "adopted" }
  | { readonly status: "refused"; readonly reason?: string };

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/**
 * Derive the only candidate refs and gate paths owned by one canonical plan.
 *
 * @param plan - Canonical delivery plan supplying stable plan/member identity.
 * @param gitCommonDir - Absolute Git common directory shared by all linked worktrees.
 * @returns Exact locators or a closed refusal for malformed authority.
 */
export function deriveDeliveryResidueLocators(
  plan: DeliveryPlanV1,
  gitCommonDir: string,
):
  | { readonly status: "derived"; readonly locators: readonly DeliveryResidueLocator[] }
  | { readonly status: "refused"; readonly reason: "plan-invalid" | "git-common-dir-invalid" } {
  const parsed = DeliveryPlanV1Schema.safeParse(plan);
  if (!parsed.success) return { status: "refused", reason: "plan-invalid" };
  if (!isAbsolute(gitCommonDir)) return { status: "refused", reason: "git-common-dir-invalid" };
  const commonDir = resolve(gitCommonDir);
  return {
    status: "derived",
    locators: parsed.data.members.map((member) => ({
      deliverableId: member.deliverableId,
      candidateRef: `refs/arc/delivery-candidates/${parsed.data.planId}/${member.chunkKey}`,
      gatePath: join(commonDir, "arc", "delivery-gates", parsed.data.planId, member.chunkKey),
    })),
  };
}

/** Derive one deterministic ARC-owned detached conflict-resolution workspace. */
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
 * Observe only the registered checkout at one exact derived gate path.
 *
 * @param input - Git boundary, exact path, and filesystem existence probe.
 * @returns Exact clean detached checkout facts, exact absence, or a refusal that preserves the path.
 */
export async function observeDeliveryGateCheckout(input: {
  readonly exec: GitExec;
  readonly path: string;
  readonly pathExists: (path: string) => Promise<boolean>;
}): Promise<DeliveryGateCheckoutObservation> {
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
 * Remove one exact clean detached gate checkout, adopting exact absence on retry.
 *
 * @param input - Git boundary, derived path, expected reserved head, and existence probe.
 * @returns Exact removal/adoption or a refusal that never force-removes a foreign checkout.
 */
export async function removeDeliveryGateCheckout(input: {
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
  const before = await observeDeliveryGateCheckout(input);
  if (before.status === "refused") return before;
  if (before.status === "absent") return { status: "adopted" };
  if (before.head !== input.expectedHead) return { status: "refused", reason: "head-mismatch" };
  try {
    await input.exec("git", ["worktree", "remove", "--", resolve(input.path)]);
  } catch {
    const afterFailure = await observeDeliveryGateCheckout(input);
    return afterFailure.status === "absent"
      ? { status: "adopted" }
      : { status: "refused", reason: "remove-failed" };
  }
  const after = await observeDeliveryGateCheckout(input);
  return after.status === "absent"
    ? { status: "removed" }
    : { status: "refused", reason: "remove-failed" };
}

export interface DeliveryResidueReapingDependencies {
  readonly observeRefreshCandidates: (planId: string) => Promise<DeliveryRefreshCandidateObservation>;
  readonly observeCandidate: (ref: string) => Promise<DeliveryCandidateObservation>;
  readonly observeGate: (path: string) => Promise<DeliveryGateCheckoutObservation>;
  readonly deleteCandidate: (input: {
    readonly ref: string;
    readonly expectedHead: string;
  }) => Promise<ExactDeleteResult>;
  readonly deleteRefreshCandidate: (input: {
    readonly ref: string;
    readonly expectedHead: string;
  }) => Promise<ExactDeleteResult>;
  readonly removeGate: (input: {
    readonly path: string;
    readonly expectedHead: string;
  }) => Promise<ExactDeleteResult>;
  readonly deleteLocalMember: (input: {
    readonly ref: string;
    readonly expectedHead: string;
  }) => Promise<ExactDeleteResult>;
  readonly deleteRemoteMember: (input: {
    readonly ref: string;
    readonly expectedHead: string;
  }) => Promise<ExactDeleteResult>;
  readonly stateStore: StateWriter;
}

export type DeliveryResidueReapingResult =
  | { readonly status: "reaped"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly deliverableId?: string;
      readonly reservation?: DeliveryRevisionedRecord<DeliveryStateV1>;
    };

/**
 * Reserve freshly paired candidate/gate heads, then reap every exact completed-delivery locator.
 *
 * @param input - Canonical plan, current state, and absolute Git-common root.
 * @param dependencies - Exact Git effects and version-checked state writer.
 * @returns Reaped state with bindings retained, or a blocked result preserving the reservation when present.
 */
export async function reapCompletedDeliveryResidue(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly gitCommonDir: string;
}, dependencies: DeliveryResidueReapingDependencies): Promise<DeliveryResidueReapingResult> {
  const derived = deriveDeliveryResidueLocators(input.plan, input.gitCommonDir);
  if (derived.status === "refused") return { status: "blocked", reason: derived.reason };
  if (validateDeliveryStateAgainstPlan(input.current.value, input.plan).status === "refused") {
    return { status: "blocked", reason: "state-plan-mismatch" };
  }

  if (input.current.value.activeOperation !== null) {
    const active = validateDeliveryActiveOperation(input.current);
    if (active.status !== "valid" || active.operation.kind !== "teardown"
      || active.operation.mode !== "closeout-residue") {
      return { status: "blocked", reason: "reservation-mismatch" };
    }
  }

  let reservation: DeliveryRevisionedRecord<DeliveryStateV1>;
  if (input.current.value.activeOperation === null) {
    const candidateHeads: Array<{ deliverableId: string; head: string | null }> = [];
    for (const locator of derived.locators) {
      const [candidate, gate] = await Promise.all([
        dependencies.observeCandidate(locator.candidateRef),
        dependencies.observeGate(locator.gatePath),
      ]);
      if (candidate.status === "refused") {
        return {
          status: "blocked",
          reason: "candidate-observation-refused",
          deliverableId: locator.deliverableId,
        };
      }
      if (gate.status === "refused") {
        return { status: "blocked", reason: `gate-${gate.reason}`, deliverableId: locator.deliverableId };
      }
      if (candidate.status === "absent" && gate.status === "absent") {
        candidateHeads.push({ deliverableId: locator.deliverableId, head: null });
        continue;
      }
      if (candidate.status !== "observed" || gate.status !== "observed" || candidate.head !== gate.head) {
        return { status: "blocked", reason: "candidate-gate-mismatch", deliverableId: locator.deliverableId };
      }
      candidateHeads.push({ deliverableId: locator.deliverableId, head: candidate.head });
    }
    const affectedDeliverableIds = input.plan.members.map(({ deliverableId }) => deliverableId);
    const before = snapshotFor(input.current.value, affectedDeliverableIds);
    const reserved = reserveDeliveryOperation(input.current, input.plan, {
      operationId: crypto.randomUUID(),
      kind: "teardown",
      mode: "closeout-residue",
      candidateHeads,
      affectedDeliverableIds,
      expectedStateRevision: input.current.revision,
      before,
      requested: before,
    });
    if (reserved.status !== "reserved") return { status: "blocked", reason: "reservation-refused" };
    const published = await dependencies.stateStore.publish(
      input.plan.planId,
      reserved.state,
      input.current.revision,
    );
    if (published.status !== "ok") return { status: "blocked", reason: "state-conflict" };
    reservation = published.value;
  } else {
    const active = validateDeliveryActiveOperation(input.current);
    if (active.status !== "valid" || active.operation.kind !== "teardown"
      || active.operation.mode !== "closeout-residue") {
      return { status: "blocked", reason: "reservation-mismatch" };
    }
    reservation = input.current;
  }

  const refreshCandidates = await dependencies.observeRefreshCandidates(input.plan.planId);
  if (refreshCandidates.status === "refused") {
    return { status: "blocked", reason: "refresh-candidate-observation-refused", reservation };
  }
  for (const candidate of refreshCandidates.candidates) {
    const deleted = await dependencies.deleteRefreshCandidate({
      ref: candidate.ref,
      expectedHead: candidate.head,
    });
    if (deleted.status === "refused") {
      return { status: "blocked", reason: "refresh-candidate-delete-refused", reservation };
    }
  }

  const operation = reservation.value.activeOperation;
  if (operation?.kind !== "teardown" || operation.mode !== "closeout-residue") {
    return { status: "blocked", reason: "reservation-mismatch", reservation };
  }
  for (const member of reservation.value.members.slice(0, -1)) {
    if (member.ref === null || member.coordinates === null
      || !member.ref.startsWith("refs/heads/delivery/")) {
      return { status: "blocked", reason: "member-ref-invalid", deliverableId: member.deliverableId, reservation };
    }
    const exact = { ref: member.ref, expectedHead: member.coordinates.head };
    const local = await dependencies.deleteLocalMember(exact);
    if (local.status === "refused") {
      return { status: "blocked", reason: "local-member-delete-refused", deliverableId: member.deliverableId, reservation };
    }
    const remote = await dependencies.deleteRemoteMember(exact);
    if (remote.status === "refused") {
      return { status: "blocked", reason: "remote-member-delete-refused", deliverableId: member.deliverableId, reservation };
    }
  }

  const headsById = new Map(operation.candidateHeads.map((candidate) => [candidate.deliverableId, candidate.head]));
  for (const locator of derived.locators) {
    const expectedHead = headsById.get(locator.deliverableId);
    if (expectedHead === undefined) {
      return { status: "blocked", reason: "reservation-mismatch", deliverableId: locator.deliverableId, reservation };
    }
    if (expectedHead === null) {
      const [candidate, gate] = await Promise.all([
        dependencies.observeCandidate(locator.candidateRef),
        dependencies.observeGate(locator.gatePath),
      ]);
      if (candidate.status !== "absent" || gate.status !== "absent") {
        return { status: "blocked", reason: "unreserved-residue", deliverableId: locator.deliverableId, reservation };
      }
      continue;
    }
    const candidate = await dependencies.deleteCandidate({
      ref: locator.candidateRef,
      expectedHead,
    });
    if (candidate.status === "refused") {
      return { status: "blocked", reason: "candidate-delete-refused", deliverableId: locator.deliverableId, reservation };
    }
    const gate = await dependencies.removeGate({ path: locator.gatePath, expectedHead });
    if (gate.status === "refused") {
      return { status: "blocked", reason: "gate-remove-refused", deliverableId: locator.deliverableId, reservation };
    }
  }

  const cleared = { ...reservation.value, activeOperation: null };
  const published = await dependencies.stateStore.publish(
    input.plan.planId,
    cleared,
    reservation.revision,
  );
  return published.status === "ok"
    ? { status: "reaped", state: published.value }
    : { status: "blocked", reason: "state-conflict", reservation };
}

function snapshotFor(
  state: DeliveryStateV1,
  deliverableIds: readonly string[],
) {
  return {
    target: state.target,
    members: deliverableIds.flatMap((deliverableId) => {
      const member = state.members.find((candidate) => candidate.deliverableId === deliverableId);
      return member === undefined ? [] : [{
        deliverableId: member.deliverableId,
        ref: member.ref,
        changeRequest: member.changeRequest,
        coordinates: member.coordinates,
      }];
    }),
  };
}
