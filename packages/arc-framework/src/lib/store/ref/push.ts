/** State publication from captured source tips after an initial reconciliation. */

import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { isGitProcessError } from "../../git/process-error.js";
import { classifyPushOutcome, type PushClassification } from "../../git/push-classification.js";
import type { FamilyId } from "../catalog.js";
import { statePushFamilies, statePushStates, refMovementFamilies, successfulStatePublishes } from "./push-families.js";
import type { PushInput, PushResult, PublishOutcome } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { readRefRepository, writeRefRepository } from "./repository.js";
import { refSyncTransportRemedy } from "./sync-remedy.js";
import { waitForPushRetry } from "./push-backoff.js";
import { withRefSyncDeadline, refSyncDeadlineExpired } from "./sync-deadline.js";
import { pullRefStore } from "./pull.js";
import { refPushTarget } from "./fetch-target.js";
import { recordPushTracking } from "./push-tracking.js";
import { capturePushListing, readPushHistoryRefs, pushListingIncludesTracking, type RefPushListing } from "./push-listing.js";
import { excludeBrokenPushRefs, type RefPushExclusion } from "./push-exclusion.js";
import { captureRefCarry, finishRefCarry, pushRefListingWithCarry, type RefCarryPublication } from "./push-carry.js";

/** Reconcile first, then publish only a stable listing of this clone's changed refs. */
export async function pushRefStore(context: RefBackendContext, input: PushInput = {}): Promise<StoreResult<PushResult>> {
  try { return await withRefSyncDeadline(context, async (scoped) => {
    const carry = await captureRefCarry(scoped, input.carry);
    const result = await publishRefStore(scoped, carry);
    if (carry && result.status === "ok") result.result.carry = await finishRefCarry(carry);
    return result;
  }); }
  catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the push." } } };
  }
}

interface PushLoop {
  carry?: RefCarryPublication;
  pulls: PushResult["pulls"];
  reconciled: Set<FamilyId>; pushed: Set<FamilyId>; retryCount: number; waitedMs: number; lastPushMs: number;
  states: PushResult["states"];
  refusals: RefPushExclusion["failures"];
  pending?: { designation: string; listing: RefPushListing; outcome: Extract<PushClassification, { status: "lost-race" | "by-state" }> };
}

async function publishRefStore(context: RefBackendContext, carry?: RefCarryPublication): Promise<StoreResult<PushResult>> {
  const loop: PushLoop = { carry, pulls: [], reconciled: new Set(), pushed: new Set(), retryCount: 0, waitedMs: 0, lastPushMs: 0, states: [], refusals: [] };
  for (;;) {
    if (refSyncDeadlineExpired(context)) return exhaustedStatePublication(context, loop);
    let result: StoreResult<PushResult> | "retry";
    try { result = await publishRefAttempt(context.repository?.source ?? context, loop); }
    catch (error) {
      if (!context.syncDeadline?.signal.aborted || !isGitProcessError(error) || error.kind !== "canceled") throw error;
      return timedOutStatePublication(context, loop);
    }
    if (result !== "retry") return result;
    loop.retryCount++;
    loop.waitedMs += await waitForPushRetry(context, loop.retryCount, loop.lastPushMs);
  }
}

async function publishRefAttempt(context: RefBackendContext, loop: PushLoop): Promise<StoreResult<PushResult> | "retry"> {
  const source = context.repository?.source ?? context;
  const designation = await readRefDesignation(context), stop = refDesignationStop(designation);
  if (stop) return { status: "ok", result: { states: statePushStates([stop], await context.identity()), pulls: loop.pulls, publishes: [] } };
  const remote = designation.pushes[0];
  if (!remote) return { status: "ok", result: { states: statePushStates([{ status: "no-remote" }], await context.identity()), pulls: loop.pulls, publishes: [] } };
  const { pulled, merged } = await pullPushBasis(source, remote.name, loop);
  if (pulled.status === "refused") return pulled;
  loop.pulls.push(...pulled.result.pulls);
  const result: PushResult = { ...pulled.result, states: statePushStates(pulled.result.states, await context.identity()), pulls: loop.pulls, publishes: [] };
  loop.states = result.states;
  const failedPull = pulled.result.pulls.find((pull) => pull.status === "failed" && (pull.role === "state"
    || pull.failure.code === "unreachable" && pull.failure.cause === "timeout"));
  if (failedPull?.status === "failed") return failedStatePublication(context, result, failedPull.failure, loop);
  const unsettled = settlePushRejection(loop, designation, merged);
  if (unsettled) return failedStatePublication(context, result, pushOutcomeFailure(context, unsettled), loop);
  context = await writeRefRepository(context);
  const refused = pulled.result.pulls.filter((pull) => pull.remote === remote.name && pull.role === "state")
    .flatMap(({ notices }) => notices).filter((notice) => notice.kind === "history-diverged");
  const captured = await capturePushListing(context, remote.name, await context.identity(), new Set(refused.map(({ ref }) => ref)));
  const divergence = refused.find((notice) => captured.changes.some(({ ref }) => ref === notice.ref));
  if (divergence?.kind === "history-diverged") return failedStatePublication(context, result, {
    code: "refused", class: "terminal", message: `Unpublished writes remain on ${divergence.ref}, whose remote history diverged.`,
    condition: divergence.condition, remedy: divergence.remedy,
  }, loop);
  const notices = pulled.result.pulls.filter((pull) => pull.remote === remote.name && pull.role === "state").flatMap(({ notices }) => notices);
  const excluded = await excludeBrokenPushRefs(context, captured, notices), listing = excluded.listing;
  loop.refusals = excluded.failures;
  const target = await checkedPushTarget(context, remote, designation, listing, merged);
  if (target === null) return "retry";
  const outcome = await publishListing(context, remote.name, target, listing, loop);
  if (outcome.status === "lost-race") return "retry";
  if (outcome.status === "by-state") {
    loop.pending = { designation: JSON.stringify(designation), listing, outcome };
    return "retry";
  }
  if (outcome.status !== "ok") return failedStatePublication(context, result, pushOutcomeFailure(context, outcome), loop);
  result.publishes = [...refusedStatePublishes(loop), ...successfulStatePublishes(unrefusedFamilies(await context.identity(), loop),
    loop.reconciled, loop.pushed, loop.retryCount, loop.waitedMs)];
  return { status: "ok", result };
}

function settlePushRejection(loop: PushLoop, designation: RefDesignation, incoming: ReadonlyMap<string, string>) {
  const pending = loop.pending;
  loop.pending = undefined;
  return pending?.designation === JSON.stringify(designation)
    && pending.listing.changes.every(({ ref }) => incoming.get(ref) === pending.listing.tracking.get(ref)) ? pending.outcome : null;
}

type StatePushFailure = Extract<PublishOutcome, { status: "failed" }>["failure"];

async function failedStatePublication(context: RefBackendContext, result: PushResult, failure: StatePushFailure,
  loop: PushLoop): Promise<StoreResult<PushResult>> {
  const families = unrefusedFamilies(await context.identity(), loop);
  return { status: "ok", result: { ...result, publishes: [...refusedStatePublishes(loop), ...families.length ? [{ status: "failed" as const, families, failure,
    retryCount: loop.retryCount, waitedMs: loop.waitedMs }] : []] } };
}

function unrefusedFamilies(identity: string | null, loop: PushLoop): FamilyId[] {
  const refused = new Set(loop.refusals.flatMap(({ families }) => families));
  return statePushFamilies(identity).filter((family) => !refused.has(family));
}

function refusedStatePublishes(loop: PushLoop): PublishOutcome[] {
  return loop.refusals.map((failure) => ({ status: "failed", ...failure, retryCount: loop.retryCount, waitedMs: loop.waitedMs }));
}

function pushOutcomeFailure(context: RefBackendContext, outcome: Exclude<PushClassification, { status: "ok" }>): StatePushFailure {
  return outcome.status === "unreachable"
    ? { code: "unreachable", class: "recoverable", cause: outcome.cause,
      condition: outcome.message || "The state push could not reach its receiver.",
      remedy: refSyncTransportRemedy(context, "push") }
    : { code: "refused", class: "terminal", message: outcome.message || "The receiver refused the state push.",
      condition: "The receiver refused publication; all unaccepted writes remain local.",
      remedy: { text: outcome.status === "refused" && outcome.reason === "atomic-unsupported"
        ? "Enable atomic pushes on the receiver, then retry the push." : "Repair the reported receiver policy or hook and retry the push." } };
}

async function publishListing(context: RefBackendContext, remote: string, target: string, listing: RefPushListing, loop: PushLoop): Promise<PushClassification> {
  if (listing.changes.length === 0) return { status: "ok", message: "" };
  const changes = listing.changes.map((change) => /^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(change.ref)
    ? { ...change, expected: listing.tracking.get(change.ref) ?? null } : change);
  const started = context.clock().getTime();
  const outcome = await pushRefListingWithCarry(context, remote, target, changes, loop.carry);
  loop.lastPushMs = Math.max(0, context.clock().getTime() - started);
  await recordPushTracking(context, remote, listing, outcome);
  if (outcome.status === "refs") for (const row of outcome.refs) {
    if (row.status === "ok") for (const family of await refMovementFamilies(context, row.ref, listing.tracking.get(row.ref) ?? null,
      listing.changes.find((change) => change.ref === row.ref)?.next ?? null)) loop.pushed.add(family);
  }
  return classifyPushOutcome(outcome);
}

async function pullPushBasis(context: RefBackendContext, remote: string, loop: PushLoop) {
  let merged: ReadonlyMap<string, string> = new Map();
  const physical = await readRefRepository(context);
  const history = await readPushHistoryRefs(physical, remote, await context.identity());
  const pulled = await pullRefStore(context, { history }, (name, incoming) => { if (name === remote) merged = incoming; },
    async (physical, ref, before, after) => { for (const family of await refMovementFamilies(physical, ref, before, after)) loop.reconciled.add(family); });
  return { pulled, merged };
}

async function checkedPushTarget(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  listing: RefPushListing, merged: ReadonlyMap<string, string>): Promise<string | null> {
  if (!await pushListingIncludesTracking(context, listing, merged)) return null;
  const target = await refPushTarget(context, remote, designation);
  const source = context.repository?.source ?? context;
  return JSON.stringify(await readRefDesignation(source)) === JSON.stringify(designation) ? target : null;
}

async function exhaustedStatePublication(context: RefBackendContext, loop: PushLoop): Promise<StoreResult<PushResult>> {
  const result: PushResult = { states: statePushStates(loop.states, await context.identity()), pulls: loop.pulls, publishes: [] };
  return failedStatePublication(context, result, { code: "retries-exhausted", class: "recoverable",
    retryCount: loop.retryCount, waitedMs: loop.waitedMs,
    condition: "The push deadline expired between attempts; unpublished writes remain local.",
    remedy: { text: "Retry the push; it will fetch and reconcile the saved writes first." } }, loop);
}

async function timedOutStatePublication(context: RefBackendContext, loop: PushLoop): Promise<StoreResult<PushResult>> {
  context = await readRefRepository(context);
  const result: PushResult = { states: statePushStates(loop.states, await context.identity()), pulls: loop.pulls, publishes: [] };
  return failedStatePublication(context, result, pushOutcomeFailure(context, { status: "unreachable", cause: "timeout",
    message: "The push deadline expired while running Git; retry to reconcile any writes the receiver accepted." }), loop);
}
