/** Request-flight reduction and single-use exact-head repair authorization. */

import type { ReviewReceipt, ReviewRequest } from "./execution.js";
import { computeRequestKey, computeRequirementKey, createReceipt } from "./request-key.js";

export type RequestFlightState =
  | "pending-trigger"
  | "queued"
  | "acknowledged"
  | "running"
  | "terminal"
  | "contaminated"
  | "abandoned"
  | "superseded";

export interface RequestFlight {
  requestKey: string;
  requirementKey: string;
  request: ReviewRequest;
  state: RequestFlightState;
  findingIds: string[];
}

export interface RequestFlightReduction {
  flights: RequestFlight[];
  ambiguous: boolean;
}

/** Canonical host-side activity paired to one known request and exact head. */
export interface HostFlightObservation {
  requestKey: string;
  headSha: string;
  state: "queued" | "running" | "terminal";
}

const ACTIVE_STATES = new Set<RequestFlightState>(["pending-trigger", "queued", "acknowledged", "running"]);

function stateForReceipt(receipt: ReviewReceipt): RequestFlightState | null {
  switch (receipt.action) {
    case "reserved":
      return receipt.request.requestMechanism === "user-trigger" ? "pending-trigger" : "queued";
    case "acknowledged": return "acknowledged";
    case "running": return "running";
    case "terminal-failure":
    case "attested":
    case "unadmitted": return "terminal";
    case "contaminated": return "contaminated";
    case "abandoned": return "abandoned";
    case "superseded": return "superseded";
    case "source-superseded": return "superseded";
    default: return null;
  }
}

/** Reduce every known request generation and detect simultaneous active generations. */
export function reduceRequestFlights(
  receipts: readonly ReviewReceipt[],
  observations: readonly HostFlightObservation[] = [],
): RequestFlightReduction {
  const byRequest = new Map<string, RequestFlight>();
  let ambiguous = false;
  for (const receipt of receipts) {
    const state = stateForReceipt(receipt);
    if (state === null) continue;
    const requestKey = computeRequestKey(receipt.request);
    const prior = byRequest.get(requestKey);
    byRequest.set(requestKey, {
      requestKey,
      requirementKey: computeRequirementKey(receipt.request),
      request: receipt.request,
      state,
      findingIds: receipt.findingIds.length > 0 ? [...receipt.findingIds] : prior?.findingIds ?? [],
    });
  }
  for (const observation of observations) {
    const prior = byRequest.get(observation.requestKey);
    if (prior === undefined || prior.request.coverageThroughSha !== observation.headSha) {
      ambiguous = true;
      continue;
    }
    if (!ACTIVE_STATES.has(prior.state) && prior.state !== observation.state) {
      ambiguous = true;
      continue;
    }
    byRequest.set(observation.requestKey, { ...prior, state: observation.state });
  }
  const flights = [...byRequest.values()];
  const activeByRequirement = new Map<string, number>();
  for (const flight of flights) {
    if (!ACTIVE_STATES.has(flight.state)) continue;
    activeByRequirement.set(flight.requirementKey, (activeByRequirement.get(flight.requirementKey) ?? 0) + 1);
  }
  return { flights, ambiguous: ambiguous || [...activeByRequirement.values()].some((count) => count > 1) };
}

export type HeadMutabilityResult =
  | { kind: "allow"; reason: "unchanged-head" | "authorized-head-update"; authorizationReceiptHash?: string }
  | { kind: "refuse"; reason: "active-flight" | "ambiguous-flight" | "ambiguous-authorization" | "missing-authorization" | "unexpected-head" | "reused-authorization" };

function authorizations(receipts: readonly ReviewReceipt[]): ReviewReceipt[] {
  return receipts.filter((receipt) => receipt.action === "begin-fix"
    && receipt.payload.kind === "head-update-authorization");
}

function isConsumed(receipts: readonly ReviewReceipt[], authorization: ReviewReceipt): boolean {
  return receipts.some((receipt) => receipt.action === "head-update-consumed"
    && receipt.payload.kind === "head-update-consumption"
    && receipt.payload.authorizationReceiptHash === authorization.receiptHash);
}

/** Decide whether one exact canonical head may move to one proposed target. */
export function queryHeadMutability(input: {
  receipts: readonly ReviewReceipt[];
  observations?: readonly HostFlightObservation[];
  currentHeadSha: string;
  proposedHeadSha: string;
}): HeadMutabilityResult {
  if (input.currentHeadSha === input.proposedHeadSha) return { kind: "allow", reason: "unchanged-head" };
  const reduction = reduceRequestFlights(input.receipts, input.observations ?? []);
  if (reduction.ambiguous) return { kind: "refuse", reason: "ambiguous-flight" };
  if (reduction.flights.some((flight) => flight.request.coverageThroughSha === input.currentHeadSha
    && ACTIVE_STATES.has(flight.state))) return { kind: "refuse", reason: "active-flight" };
  const candidates = authorizations(input.receipts).filter((receipt) =>
    receipt.payload.kind === "head-update-authorization"
    && receipt.payload.oldHeadSha === input.currentHeadSha);
  if (candidates.length === 0) return { kind: "refuse", reason: "missing-authorization" };
  if (candidates.length > 1) return { kind: "refuse", reason: "ambiguous-authorization" };
  const exact = candidates.filter((receipt) => receipt.payload.kind === "head-update-authorization"
    && receipt.payload.targetHeadSha === input.proposedHeadSha);
  if (exact.length !== 1) return { kind: "refuse", reason: "unexpected-head" };
  const authorization = exact[0];
  if (authorization === undefined) return { kind: "refuse", reason: "unexpected-head" };
  if (isConsumed(input.receipts, authorization)) return { kind: "refuse", reason: "reused-authorization" };
  return { kind: "allow", reason: "authorized-head-update", authorizationReceiptHash: authorization.receiptHash };
}

export type BeginFixPlan =
  | { ok: true; receipt: ReviewReceipt }
  | { ok: false; reason: "actor-not-authorized" | "terminal-findings-required" | "carried-findings-mismatch" | "authorization-exists" | "target-head-unchanged" };

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item));
}

/** Plan one actor-authorized repair transition from exact terminal findings. */
export function planBeginFix(input: {
  receipts: readonly ReviewReceipt[];
  terminalRequestKey: string;
  actorIdentity: string;
  authorizedActorIdentities: readonly string[];
  targetHeadSha: string;
  carriedFindingIds: readonly string[];
  expectedLedgerVersion: number;
  authorizedAt: Date;
}): BeginFixPlan {
  if (!input.authorizedActorIdentities.includes(input.actorIdentity)) return { ok: false, reason: "actor-not-authorized" };
  const terminal = [...input.receipts].reverse().find((receipt) =>
    computeRequestKey(receipt.request) === input.terminalRequestKey
    && receipt.result === "findings"
    && receipt.payload.kind === "terminal-evidence");
  if (terminal === undefined) return { ok: false, reason: "terminal-findings-required" };
  if (terminal.request.coverageThroughSha === input.targetHeadSha) return { ok: false, reason: "target-head-unchanged" };
  if (!sameSet(input.carriedFindingIds, terminal.findingIds)) return { ok: false, reason: "carried-findings-mismatch" };
  const exists = authorizations(input.receipts).some((receipt) => receipt.payload.kind === "head-update-authorization"
    && receipt.payload.terminalRequestKey === input.terminalRequestKey);
  if (exists) return { ok: false, reason: "authorization-exists" };
  const findingIds = [...input.carriedFindingIds];
  return {
    ok: true,
    receipt: createReceipt({
      eventId: `begin-fix:${input.terminalRequestKey}:${input.targetHeadSha}`,
      previousLedgerVersion: input.expectedLedgerVersion,
      action: "begin-fix",
      request: terminal.request,
      result: null,
      reason: "authorized exact-head finding repair",
      evidenceUrlOrId: null,
      findingIds,
      payload: {
        kind: "head-update-authorization",
        authorizedAt: input.authorizedAt.toISOString(),
        terminalRequestKey: input.terminalRequestKey,
        oldHeadSha: terminal.request.coverageThroughSha,
        targetHeadSha: input.targetHeadSha,
        actorIdentity: input.actorIdentity,
        findingIds,
      },
    }),
  };
}

export type HeadUpdateConsumptionPlan =
  | { kind: "none"; reason: "no-authorization" }
  | { kind: "ambiguous"; reason: "ambiguous-authorization" | "terminal-evidence-missing" }
  | { kind: "consume"; receipts: ReviewReceipt[] };

/** Plan the durable transition emitted by the first reconciliation of an authorized target head. */
export function planHeadUpdateConsumption(input: {
  receipts: readonly ReviewReceipt[];
  currentHeadSha: string;
  expectedLedgerVersion: number;
  consumedAt: Date;
}): HeadUpdateConsumptionPlan {
  const candidates = authorizations(input.receipts).filter((receipt) =>
    receipt.payload.kind === "head-update-authorization"
    && receipt.payload.targetHeadSha === input.currentHeadSha
    && !isConsumed(input.receipts, receipt));
  if (candidates.length === 0) return { kind: "none", reason: "no-authorization" };
  if (candidates.length !== 1) return { kind: "ambiguous", reason: "ambiguous-authorization" };
  const authorization = candidates[0];
  if (authorization === undefined || authorization.payload.kind !== "head-update-authorization") {
    return { kind: "ambiguous", reason: "ambiguous-authorization" };
  }
  const authorizationPayload = authorization.payload;
  const terminal = [...input.receipts].reverse().find((receipt) =>
    computeRequestKey(receipt.request) === authorizationPayload.terminalRequestKey
    && receipt.result === "findings"
    && receipt.payload.kind === "terminal-evidence");
  if (terminal === undefined || terminal.evidenceUrlOrId === null) {
    return { kind: "ambiguous", reason: "terminal-evidence-missing" };
  }
  const terminalEvidenceRef = terminal.evidenceUrlOrId;
  let version = input.expectedLedgerVersion;
  const consumed = createReceipt({
    eventId: `head-update:${authorization.receiptHash}:consumed`,
    previousLedgerVersion: version,
    action: "head-update-consumed",
    request: terminal.request,
    result: null,
    reason: "consumed exact-head finding repair authorization",
    evidenceUrlOrId: null,
    findingIds: [...authorization.findingIds],
    payload: {
      kind: "head-update-consumption",
      consumedAt: input.consumedAt.toISOString(),
      authorizationReceiptHash: authorization.receiptHash,
      oldHeadSha: terminal.request.coverageThroughSha,
      newHeadSha: input.currentHeadSha,
      findingIds: [...authorization.findingIds],
    },
  });
  version += 1;
  const superseded = createReceipt({
    eventId: `head-update:${authorization.receiptHash}:superseded`,
    previousLedgerVersion: version,
    action: "superseded",
    request: terminal.request,
    result: null,
    reason: "superseded by authorized finding repair",
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "supersession", supersededAt: input.consumedAt.toISOString(), successorRequestKey: null,
      reason: "authorized head update consumed" },
  });
  version += 1;
  const carried = authorization.findingIds.map((findingId) => {
    const next = createReceipt({
      eventId: `head-update:${authorization.receiptHash}:carry:${findingId}`,
      previousLedgerVersion: version,
      action: "finding-opened",
      request: terminal.request,
      result: null,
      reason: "carried through authorized finding repair",
      evidenceUrlOrId: terminalEvidenceRef,
      findingIds: [findingId],
      payload: {
        kind: "finding-lifecycle",
        findingId,
        origin: {
          sourceIdentity: terminal.request.sourceIdentity,
          evidenceRef: terminalEvidenceRef,
          headSha: terminal.request.coverageThroughSha,
        },
        carriedThroughHeadSha: input.currentHeadSha,
        settlement: { state: "open", settledAt: null, evidenceRef: null },
      },
    });
    version += 1;
    return next;
  });
  return { kind: "consume", receipts: [consumed, superseded, ...carried] };
}
