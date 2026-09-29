/**
 * Merge-lock verb contracts — how a pull request should open, and whether a
 * hold or release applies to a live one.
 *
 * **Release is not head-atomic, and cannot be.** The host's ready-for-review flip
 * takes a pull request and nothing else: draft is a property of the pull request,
 * not of a commit, so "release head H" is not expressible against it. A release
 * therefore reports that the lock came off, never that it came off *for one head*
 * — a push landing immediately afterward leaves an unevaluated head ready, which
 * is the same accepted residual the design already carries for the whole
 * post-release window.
 *
 * What makes that safe is the merge, not the release: callers merge with the
 * host's head-matched merge, using the exact `headSha` this envelope's payload
 * carries. A caller that treats `released / proceed` as authority to merge
 * whatever head is current has stepped outside the contract.
 *
 * @module
 */

import { z } from "zod";

import {
  MergeLockHoldEnvelopeSchema,
  MergeLockReleaseEnvelopeSchema,
  MergeLockResolveEnvelopeSchema,
  type MergeLockBlockedReason,
  type MergeLockHoldEnvelope,
  type MergeLockReleaseEnvelope,
  type MergeLockResolveEnvelope,
} from "./merge-lock-command-envelope.js";
import {
  LivePullRequestSchema,
  ReviewReadinessEnvelopeSchema,
  ReviewTargetSchema,
  ReviewTreeRootSchema,
  ReviewVehicleSchema,
  type ReviewReadinessEnvelope,
  type ReviewReadinessRequest,
} from "./readiness.js";

/**
 * Input to the pre-open query. No pull request exists yet, so the request
 * carries the candidate tree alone — the opening disposition is the same for
 * every lane and vehicle kind.
 */
export const MergeLockResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
}).readonly();
export type MergeLockResolveRequest = z.infer<typeof MergeLockResolveRequestSchema>;

/**
 * Input to `hold` and `release`. Both act on a live pull request behind the
 * exact-head preflight, and the vehicle is what the readiness evaluation
 * consumes, so the two verbs take one shape.
 */
export const MergeLockTransitionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type MergeLockTransitionRequest = z.infer<typeof MergeLockTransitionRequestSchema>;
type MergeLockTransitionInput = Omit<z.input<typeof MergeLockTransitionRequestSchema>, "vehicle"> & {
  vehicle: z.input<typeof ReviewVehicleSchema> | {
    kind: "delivery-member";
    planId: string;
    deliverableId: string;
    workUnitSlug: string;
  };
};

/**
 * What the configured `merge.lock` key was found to be. The shared settings
 * reader cannot express this: it degrades an unreadable file to a warning and
 * substitutes the default, so a missing key and a missing file arrive
 * indistinguishable. The lock has to tell them apart — one is the documented
 * default, the other silently disables the control.
 */
export type MergeLockSetting =
  | { state: "absent" }
  | { state: "value"; value: string }
  | { state: "unreadable" };

/**
 * The port's own live pull-request shape. It widens the shared schema with the
 * lock state the same read already returns; the shared schema stays as it is
 * because it is embedded in the hand-composed readiness request, where a new
 * required field would break every caller.
 */
export const MergeLockPullRequestSchema = LivePullRequestSchema.extend({
  locked: z.boolean(),
});
export type MergeLockPullRequest = z.infer<typeof MergeLockPullRequestSchema>;

/** One requested lock transition against a live pull request. */
export interface MergeLockTransition {
  repository: string;
  pullRequest: number;
  transition: "hold" | "release";
}

/** Config, GitHub, and readiness boundaries used by the merge-lock verbs. */
export interface MergeLockPort {
  readMergeLock(treeRoot: string): Promise<MergeLockSetting>;
  resolveRepository(): Promise<{ repository: string; defaultBranch: string }>;
  resolvePullRequest(repository: string, pullRequest: number): Promise<MergeLockPullRequest>;
  checkReadiness(request: ReviewReadinessRequest): Promise<ReviewReadinessEnvelope>;
  applyTransition(transition: MergeLockTransition): Promise<void>;
}

type LockMode = "draft" | "none" | "unresolved";

/**
 * Resolve the key strictly. Absent is the documented `none` default; anything
 * unreadable or outside the domain fails closed rather than resolving to the
 * value that turns the control off.
 */
function lockMode(setting: MergeLockSetting): LockMode {
  if (setting.state === "unreadable") return "unresolved";
  if (setting.state === "absent") return "none";
  if (setting.value === "draft") return "draft";
  return setting.value === "none" ? "none" : "unresolved";
}

async function readLockMode(port: Pick<MergeLockPort, "readMergeLock">, treeRoot: string): Promise<LockMode> {
  try {
    return lockMode(await port.readMergeLock(treeRoot));
  } catch {
    return "unresolved";
  }
}

const CONFIG_UNRESOLVED_MESSAGE = "The merge.lock setting could not be resolved to a supported value.";

/**
 * Answer how a pull request about to be opened should be opened.
 *
 * @param input - Candidate tree root.
 * @param port - Config boundary resolved against that root.
 * @returns A strict locked, none, or blocked envelope.
 */
export async function resolveMergeLock(
  input: MergeLockResolveRequest,
  port: Pick<MergeLockPort, "readMergeLock">,
): Promise<MergeLockResolveEnvelope> {
  const request = MergeLockResolveRequestSchema.parse(input);
  const mode = await readLockMode(port, request.treeRoot);
  const base = { schemaVersion: 1 as const, mode: "merge-lock-resolve" as const };
  if (mode === "unresolved") {
    return MergeLockResolveEnvelopeSchema.parse({
      ...base,
      diagnostics: [{ code: "config-unresolved", message: CONFIG_UNRESOLVED_MESSAGE }],
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
  }
  return MergeLockResolveEnvelopeSchema.parse({
    ...base,
    diagnostics: [],
    ...(mode === "draft"
      ? { state: "locked", nextAction: "open-locked" }
      : { state: "none", nextAction: "open-plain" }),
    payload: {},
  });
}

const TRANSITIONS = {
  hold: {
    mode: "merge-lock-hold",
    settled: "held",
    /** The lock state the verb moves the pull request into. */
    targetLocked: true,
    /** Locking is always safe, so only the release side gates on readiness. */
    gatesReadiness: false,
  },
  release: {
    mode: "merge-lock-release",
    settled: "released",
    targetLocked: false,
    gatesReadiness: true,
  },
} as const;

async function transitionMergeLock(
  kind: keyof typeof TRANSITIONS,
  input: MergeLockTransitionInput,
  port: MergeLockPort,
): Promise<unknown> {
  const request = MergeLockTransitionRequestSchema.parse(input);
  const shape = TRANSITIONS[kind];
  const base = { schemaVersion: 1 as const, mode: shape.mode };
  const payload = {
    repository: request.target.repository,
    pullRequest: request.target.pullRequest,
    headSha: request.target.headSha,
  };
  const blocked = (
    reason: MergeLockBlockedReason,
    message: string,
    details: readonly { code: string; message: string }[] = [],
  ) => ({
    ...base,
    diagnostics: [{ code: reason, message }, ...details],
    state: "blocked",
    nextAction: "stop",
    payload: { ...payload, reason },
  });
  const noLock = (reason: "lock-disabled" | "already-in-state") => ({
    ...base,
    diagnostics: [],
    state: "no-lock",
    nextAction: "none",
    payload: { ...payload, reason },
  });
  const refuse = (refusal: LockRefusal) => blocked(refusal.reason, refusal.message, refusal.details ?? []);

  const lock = await readLockMode(port, request.treeRoot);
  if (lock === "unresolved") return blocked("config-unresolved", CONFIG_UNRESOLVED_MESSAGE);
  if (lock === "none" && kind === "hold") return noLock("lock-disabled");

  // A transition owes three things, in this order, and no outcome may skip one:
  //
  //   bind   — the live pull request is the target, open, at exactly the requested head
  //   gate   — the candidate is lifecycle-ready (release only; locking is always safe)
  //   settle — flip when the state differs, then confirm the flip landed on that head
  //
  // Each step refuses in its own terms and the orchestration below converts. The
  // ordering is the correctness property: a pull request someone already readied
  // still owes the gate, so "already in the requested state" is a settle-step
  // outcome rather than an early exit past it.
  const bound = await bindLiveTarget(request, port);
  if ("refusal" in bound) return refuse(bound.refusal);

  if (shape.gatesReadiness) {
    const unready = await gateCandidateReadiness(request, bound.pullRequest, port);
    if (unready !== null) return refuse(unready);
  }

  if (lock === "none") return noLock("lock-disabled");

  const settlement = await settleLockState(kind, shape, request, bound.pullRequest, port);
  if ("refusal" in settlement) return refuse(settlement.refusal);
  if (settlement.settled === "already-in-state") return noLock("already-in-state");

  return { ...base, diagnostics: [], state: shape.settled, nextAction: "proceed", payload };
}

/** A step's refusal, in its own terms — the orchestration owns envelope shape. */
interface LockRefusal {
  reason: MergeLockBlockedReason;
  message: string;
  details?: readonly { code: string; message: string }[];
}

/**
 * Bind step — resolve the live pull request and prove it is the requested target
 * at the requested head. Everything downstream reads the returned snapshot.
 */
async function bindLiveTarget(
  request: MergeLockTransitionRequest,
  port: MergeLockPort,
): Promise<{ pullRequest: MergeLockPullRequest } | { refusal: LockRefusal }> {
  let repository: { repository: string; defaultBranch: string };
  try {
    repository = await port.resolveRepository();
  } catch {
    return { refusal: {
      reason: "repository-unavailable",
      message: "The authenticated repository could not be resolved.",
    } };
  }
  if (
    repository.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || repository.defaultBranch.trim() === ""
  ) {
    return { refusal: {
      reason: "repository-mismatch",
      message: "The authenticated repository does not match the lock target.",
    } };
  }

  let pullRequest: MergeLockPullRequest;
  try {
    pullRequest = MergeLockPullRequestSchema.parse(
      await port.resolvePullRequest(request.target.repository, request.target.pullRequest),
    );
  } catch {
    return { refusal: {
      reason: "pull-request-unavailable",
      message: "The guarded pull request could not be resolved.",
    } };
  }
  if (pullRequest.state !== "open") {
    return { refusal: { reason: "pull-request-closed", message: "The guarded pull request is not open." } };
  }
  if (
    pullRequest.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || pullRequest.number !== request.target.pullRequest
  ) {
    return { refusal: {
      reason: "pull-request-mismatch",
      message: "The resolved pull request does not match the lock target.",
    } };
  }
  if (pullRequest.headSha !== request.target.headSha) {
    return { refusal: {
      reason: "stale-head",
      message: "The requested SHA is not the exact live pull-request head.",
    } };
  }
  return { pullRequest };
}

/**
 * Settle step — flip the lock when the state differs, then confirm the flip landed
 * on the bound head.
 *
 * The post-flip confirmation is **best-effort narrowing, not a guarantee** — see the
 * module note on why head-atomic release is not expressible. It exists because a step
 * that mutates state can cheaply check that its own mutation landed where it aimed,
 * and reverting leaves the safer state when it did not. Locking a newer head is still
 * locked, so `hold` only reports; `release` has left an unevaluated head mergeable and
 * puts the lock back.
 *
 * The already-in-state branch deliberately does **not** re-read. It mutated nothing, so
 * it has no effect of its own to confirm, and polling there would only sample a race
 * whose outcome is already accepted — a pull request that drifts between the bind step
 * and this decision ends up exactly where a pull request that drifts one second after a
 * successful release ends up. The line is: verify your own mutation, do not poll for
 * concurrent ones.
 */
async function settleLockState(
  kind: keyof typeof TRANSITIONS,
  shape: (typeof TRANSITIONS)[keyof typeof TRANSITIONS],
  request: MergeLockTransitionRequest,
  pullRequest: MergeLockPullRequest,
  port: MergeLockPort,
): Promise<{ settled: "transitioned" | "already-in-state" } | { refusal: LockRefusal }> {
  if (pullRequest.locked === shape.targetLocked) return { settled: "already-in-state" };

  const target = {
    repository: request.target.repository,
    pullRequest: request.target.pullRequest,
  };
  try {
    await port.applyTransition({ ...target, transition: kind });
  } catch {
    return { refusal: {
      reason: "transition-failed",
      message: `The ${kind} transition against the pull request failed.`,
    } };
  }

  let settled: MergeLockPullRequest;
  try {
    settled = MergeLockPullRequestSchema.parse(
      await port.resolvePullRequest(request.target.repository, request.target.pullRequest),
    );
  } catch {
    return { refusal: {
      reason: "pull-request-unavailable",
      message: `The guarded pull request could not be re-read to confirm the ${kind} landed on the exact head.`,
    } };
  }
  if (settled.headSha === request.target.headSha) return { settled: "transitioned" };

  if (!shape.targetLocked) {
    try {
      await port.applyTransition({ ...target, transition: "hold" });
    } catch {
      return { refusal: {
        reason: "transition-failed",
        message: "The pull request advanced during the release and the compensating hold failed.",
        details: [{
          code: "release-not-reverted",
          message: "The pull request is released on an unevaluated head; re-lock it before any merge.",
        }],
      } };
    }
  }
  return { refusal: {
    reason: "stale-head",
    message: `The pull request advanced during the ${kind}; its head is no longer the target.`,
  } };
}

/**
 * Gate step — refuse a candidate the lifecycle does not consider ready. Runs on the
 * release side whether or not a host transition turns out to be needed.
 */
async function gateCandidateReadiness(
  request: MergeLockTransitionRequest,
  pullRequest: MergeLockPullRequest,
  port: MergeLockPort,
): Promise<LockRefusal | null> {
  // The readiness request embeds the shared live-pull-request shape, which the
  // port's widened payload would fail against — narrow before composing it.
  const live = LivePullRequestSchema.parse({
    repository: pullRequest.repository,
    number: pullRequest.number,
    state: pullRequest.state,
    headBranch: pullRequest.headBranch,
    headSha: pullRequest.headSha,
  });
  let readiness: ReviewReadinessEnvelope;
  try {
    readiness = ReviewReadinessEnvelopeSchema.parse(await port.checkReadiness({
      schemaVersion: 1,
      treeRoot: request.treeRoot,
      target: request.target,
      pullRequest: live,
      vehicle: request.vehicle,
    }));
  } catch {
    return {
      reason: "readiness-failed",
      message: "The lifecycle-readiness result was unavailable or malformed.",
    };
  }
  if (
    readiness.payload.target.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || readiness.payload.target.pullRequest !== request.target.pullRequest
    || readiness.payload.target.headSha !== request.target.headSha
  ) {
    return {
      reason: "readiness-failed",
      message: "The lifecycle-readiness result belongs to a different guarded target.",
      details: [{ code: "readiness-target-mismatch", message: "Readiness did not bind the exact release target." }],
    };
  }
  if (readiness.state !== "ready") {
    return {
      reason: "readiness-failed",
      message: "The exact candidate is not lifecycle-ready.",
      details: readiness.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: `${diagnostic.path}: ${diagnostic.message}`,
      })),
    };
  }
  return null;
}

/**
 * Lock a live pull request. Locking is always safe, so no readiness gate runs.
 *
 * @param input - Guarded target, candidate tree, and vehicle.
 * @param port - Config, repository, pull-request, and transition boundary.
 * @returns A strict held, no-lock, or blocked envelope.
 */
export async function holdMergeLock(
  input: MergeLockTransitionInput,
  port: MergeLockPort,
): Promise<MergeLockHoldEnvelope> {
  return MergeLockHoldEnvelopeSchema.parse(await transitionMergeLock("hold", input, port));
}

/**
 * Unlock a live pull request behind the exact-head preflight and the
 * lifecycle-readiness gate.
 *
 * @param input - Guarded target, candidate tree, and vehicle.
 * @param port - Config, repository, pull-request, readiness, and transition boundary.
 * @returns A strict released, no-lock, or blocked envelope.
 */
export async function releaseMergeLock(
  input: MergeLockTransitionInput,
  port: MergeLockPort,
): Promise<MergeLockReleaseEnvelope> {
  return MergeLockReleaseEnvelopeSchema.parse(await transitionMergeLock("release", input, port));
}
