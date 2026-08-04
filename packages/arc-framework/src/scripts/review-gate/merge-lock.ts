/**
 * Merge-lock verb contracts — how a pull request should open, and whether a
 * hold or release applies to a live one.
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
  input: MergeLockTransitionRequest,
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

  const lock = await readLockMode(port, request.treeRoot);
  if (lock === "unresolved") return blocked("config-unresolved", CONFIG_UNRESOLVED_MESSAGE);
  if (lock === "none") return noLock("lock-disabled");

  let repository: { repository: string; defaultBranch: string };
  try {
    repository = await port.resolveRepository();
  } catch {
    return blocked("repository-unavailable", "The authenticated repository could not be resolved.");
  }
  if (
    repository.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || repository.defaultBranch.trim() === ""
  ) {
    return blocked("repository-mismatch", "The authenticated repository does not match the lock target.");
  }

  let pullRequest: MergeLockPullRequest;
  try {
    pullRequest = MergeLockPullRequestSchema.parse(
      await port.resolvePullRequest(request.target.repository, request.target.pullRequest),
    );
  } catch {
    return blocked("pull-request-unavailable", "The guarded pull request could not be resolved.");
  }
  if (pullRequest.state !== "open") {
    return blocked("pull-request-closed", "The guarded pull request is not open.");
  }
  if (
    pullRequest.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || pullRequest.number !== request.target.pullRequest
  ) {
    return blocked("pull-request-mismatch", "The resolved pull request does not match the lock target.");
  }
  if (pullRequest.headSha !== request.target.headSha) {
    return blocked("stale-head", "The requested SHA is not the exact live pull-request head.");
  }
  if (pullRequest.locked === shape.targetLocked) return noLock("already-in-state");

  if (shape.gatesReadiness) {
    const refused = await refuseUnreadyCandidate(request, pullRequest, port, blocked);
    if (refused !== null) return refused;
  }

  try {
    await port.applyTransition({
      repository: request.target.repository,
      pullRequest: request.target.pullRequest,
      transition: kind,
    });
  } catch {
    return blocked("transition-failed", `The ${kind} transition against the pull request failed.`);
  }
  return { ...base, diagnostics: [], state: shape.settled, nextAction: "proceed", payload };
}

async function refuseUnreadyCandidate(
  request: MergeLockTransitionRequest,
  pullRequest: MergeLockPullRequest,
  port: MergeLockPort,
  blocked: (
    reason: MergeLockBlockedReason,
    message: string,
    details?: readonly { code: string; message: string }[],
  ) => unknown,
): Promise<unknown> {
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
    return blocked("readiness-failed", "The lifecycle-readiness result was unavailable or malformed.");
  }
  if (
    readiness.payload.target.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || readiness.payload.target.pullRequest !== request.target.pullRequest
    || readiness.payload.target.headSha !== request.target.headSha
  ) {
    return blocked(
      "readiness-failed",
      "The lifecycle-readiness result belongs to a different guarded target.",
      [{ code: "readiness-target-mismatch", message: "Readiness did not bind the exact release target." }],
    );
  }
  if (readiness.state !== "ready") {
    return blocked(
      "readiness-failed",
      "The exact candidate is not lifecycle-ready.",
      readiness.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: `${diagnostic.path}: ${diagnostic.message}`,
      })),
    );
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
  input: MergeLockTransitionRequest,
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
  input: MergeLockTransitionRequest,
  port: MergeLockPort,
): Promise<MergeLockReleaseEnvelope> {
  return MergeLockReleaseEnvelopeSchema.parse(await transitionMergeLock("release", input, port));
}
