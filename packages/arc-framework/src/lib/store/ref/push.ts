/** State publication from captured source tips after an initial reconciliation. */

import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { pushRefs } from "../../git/push.js";
import { classifyPushOutcome, type PushClassification } from "../../git/push-classification.js";
import type { FamilyId } from "../catalog.js";
import { statePushFamilies, statePushStates, refMovementFamilies, successfulStatePublishes } from "./push-families.js";
import type { PushInput, PushResult, PublishOutcome } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { writeRefRepository } from "./repository.js";
import { pullRefStore } from "./pull.js";
import { recordPushTracking } from "./push-tracking.js";
import { capturePushListing, pushListingIncludesTracking, type RefPushListing } from "./push-listing.js";

/** Reconcile first, then publish only a stable listing of this clone's changed refs. */
export async function pushRefStore(context: RefBackendContext, input: PushInput = {}): Promise<StoreResult<PushResult>> {
  void input;
  try { return await publishRefStore(context); }
  catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the push." } } };
  }
}

interface PushLoop {
  pulls: PushResult["pulls"];
  reconciled: Set<FamilyId>; pushed: Set<FamilyId>; retryCount: number; waitedMs: number;
  pending?: { designation: string; listing: RefPushListing; outcome: Extract<PushClassification, { status: "lost-race" | "by-state" }> };
}

async function publishRefStore(context: RefBackendContext): Promise<StoreResult<PushResult>> {
  const loop: PushLoop = { pulls: [], reconciled: new Set(), pushed: new Set(), retryCount: 0, waitedMs: 0 };
  for (;;) {
    const result = await publishRefAttempt(context.repository?.source ?? context, loop);
    if (result !== "retry") return result;
    loop.retryCount++;
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
  const failedPull = pulled.result.pulls.find((pull) => pull.role === "state" && pull.status === "failed");
  if (failedPull?.status === "failed") return failedStatePublication(context, result, failedPull.failure, loop);
  const unsettled = settlePushRejection(loop, designation, merged);
  if (unsettled) return failedStatePublication(context, result, pushOutcomeFailure(unsettled), loop);
  context = await writeRefRepository(context);
  const listing = await capturePushListing(context, remote.name, await context.identity());
  const target = await checkedPushTarget(context, remote, designation, listing, merged);
  if (target === null) return "retry";
  const outcome = await publishListing(context, remote.name, target, listing, loop);
  if (outcome.status === "lost-race") return "retry";
  if (outcome.status === "by-state") {
    loop.pending = { designation: JSON.stringify(designation), listing, outcome };
    return "retry";
  }
  if (outcome.status !== "ok") return failedStatePublication(context, result, pushOutcomeFailure(outcome), loop);
  result.publishes = successfulStatePublishes(statePushFamilies(await context.identity()), loop.reconciled, loop.pushed, loop.retryCount, loop.waitedMs);
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
  const families = statePushFamilies(await context.identity());
  return { status: "ok", result: { ...result, publishes: [{ status: "failed", families, failure,
    retryCount: loop.retryCount, waitedMs: loop.waitedMs }] } };
}

function pushOutcomeFailure(outcome: Exclude<PushClassification, { status: "ok" }>): StatePushFailure {
  return outcome.status === "unreachable"
    ? { code: "unreachable", class: "recoverable", cause: outcome.cause,
      condition: outcome.message || "The state push could not reach its receiver.",
      remedy: { text: "Repair connectivity or authentication and retry the push." } }
    : { code: "refused", class: "terminal", message: outcome.message || "The receiver refused the state push.",
      condition: "The receiver refused publication; all unaccepted writes remain local.",
      remedy: { text: outcome.status === "refused" && outcome.reason === "atomic-unsupported"
        ? "Enable atomic pushes on the receiver, then retry the push." : "Repair the reported receiver policy or hook and retry the push." } };
}

async function pushRemoteTarget(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation): Promise<string> {
  if (remote.repository === "backing" || remote.name === designation.codeRemote) return remote.name;
  const source = context.repository?.source ?? context;
  return (await source.exec("git", ["remote", "get-url", "--push", remote.name], { cwd: source.checkoutRoot })).stdout.trim();
}

async function publishListing(context: RefBackendContext, remote: string, target: string, listing: RefPushListing, loop: PushLoop): Promise<PushClassification> {
  if (listing.changes.length === 0) return { status: "ok", message: "" };
  const changes = listing.changes.map((change) => /^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(change.ref)
    ? { ...change, expected: listing.tracking.get(change.ref) ?? null } : change);
  const outcome = await pushRefs(context.exec, target, changes, { cwd: context.checkoutRoot });
  await recordPushTracking(context, remote, listing, outcome);
  if (outcome.status === "refs") for (const row of outcome.refs) {
    if (row.status === "ok") for (const family of await refMovementFamilies(context, row.ref, listing.tracking.get(row.ref) ?? null,
      listing.changes.find((change) => change.ref === row.ref)?.next ?? null)) loop.pushed.add(family);
  }
  return classifyPushOutcome(outcome);
}

async function pullPushBasis(context: RefBackendContext, remote: string, loop: PushLoop) {
  let merged: ReadonlyMap<string, string> = new Map();
  const pulled = await pullRefStore(context, {}, (name, incoming) => { if (name === remote) merged = incoming; },
    async (physical, ref, before, after) => { for (const family of await refMovementFamilies(physical, ref, before, after)) loop.reconciled.add(family); });
  return { pulled, merged };
}

async function checkedPushTarget(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  listing: RefPushListing, merged: ReadonlyMap<string, string>): Promise<string | null> {
  if (!await pushListingIncludesTracking(context, listing, merged)) return null;
  const target = await pushRemoteTarget(context, remote, designation);
  const source = context.repository?.source ?? context;
  return JSON.stringify(await readRefDesignation(source)) === JSON.stringify(designation) ? target : null;
}
