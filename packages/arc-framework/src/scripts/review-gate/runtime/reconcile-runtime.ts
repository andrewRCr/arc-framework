/**
 * Production `ReconcileRuntime` composing the host, receipt-store, and provider
 * adapters into the guarded read/reduce/execute/publish orchestration.
 *
 * `read()` resolves canonical state live and retains the full resolution
 * internally; `reduce()` is pure over that cached snapshot and delegates to the
 * core `reduceSelfHostingGate` assembly; `execute()` drives the reserve-confirm-
 * invoke-acknowledge protocol through the injected receipt store and provider;
 * `publish()` projects the verdict through the host adapter.
 *
 * @module
 */

import { hashContent } from "../../../lib/manifest/hash.js";
import { ingestReviewCommands, type AuthorizedReviewCommandEvent, type ReviewCommandComment } from "../core/command-ingestion.js";
import { deriveReviewGateAction } from "../core/next-action.js";
import { createDirectCommandReceipt, planCommandRefresh } from "../core/command-receipts.js";
import { planHeadUpdateConsumption } from "../core/head-mutability.js";
import { reduceExclusiveTriggerWindow, type TriggerEvent } from "../core/trigger-window.js";
import type { GitHubTriggerHistoryEvent } from "../hosts/github/trigger-history.js";
import type { CapabilitySet, NormalizedChangeRequest, ReviewRequirement } from "../core/contracts.js";
import type { Evidence } from "../core/evidence.js";
import type { GateProjection, ReceiptEnvelope, ReviewReceipt, ReviewRequest, SourceCapacity } from "../core/execution.js";
import { canonicalizePlainJson, computePolicyVersion } from "../core/identity.js";
import type { LifecycleTailProof } from "../core/lifecycle-tail.js";
import type {
  ActorAddress,
  GitHostAdapter,
  HostChangeContext,
  LifecycleTailProofAdapter,
  ReviewProviderAdapter,
  ReviewReceiptStore,
} from "../core/ports.js";
import {
  extractAuthenticatedReceiptEvidence,
} from "../core/reduction.js";
import {
  reduceSelfHostingGate,
  type SelfHostingGateReductionInput,
} from "../policy/self-hosting/reduction.js";
import { createReceipt, computeRequestKey } from "../core/request-key.js";
import {
  executeConfirmedRequest,
  reserveRequest,
  type RequestExecutionResult,
} from "../core/request-execution.js";
import {
  resolveSelfHostingDecision,
  type SelfHostingDecision,
} from "../policy/self-hosting/decision.js";
import type { ChangedPath, LaneDecision } from "../policy/self-hosting/lane.js";
import { qualifyIndependentAnalysisSource } from "../policy/self-hosting/qualification.js";
import type { ReviewRiskDecision } from "../policy/self-hosting/risk.js";
import type { SelfHostingPolicy, SourceQualificationDeclaration } from "../policy/self-hosting/schema.js";
import type { ContextMode } from "./rollout.js";
import type {
  CanonicalReconcileState,
  ReconcileDecision,
  ReconcileRuntime,
} from "./reconcile.js";

/** Immutable PR coordinates the runtime reconciles. */
export interface ReconcileCoordinates {
  repositoryId: number;
  pullRequestNumber: number;
  hostRef: string;
}

/** Inputs a lane resolver derives from one canonical change read. */
export interface LaneResolutionInput {
  authorLogin: string;
  diffBaseSha: string;
  headSha: string;
  changes: ChangedPath[];
}

/** Injected adapters, policy, and canonical resolvers for one reconcile runtime. */
export interface ReconcileRuntimeDependencies {
  policy: SelfHostingPolicy;
  host: GitHostAdapter;
  store: ReviewReceiptStore;
  provider: ReviewProviderAdapter;
  lifecycleTailAdapter: LifecycleTailProofAdapter;
  coordinates: ReconcileCoordinates;
  mode: ContextMode;
  expectedAppId: string;
  /** Resolve the pinned CI signal for a head, independent of the runtime's transport. */
  resolveCiState: (headSha: string) => Promise<"pending" | "failure" | "success">;
  /** Resolve automatic-lane eligibility from the canonical change read. */
  resolveLane: (input: LaneResolutionInput) => Promise<LaneDecision>;
  /** Classify stable review risk from the canonical change read. */
  resolveRisk: (changes: ChangedPath[]) => ReviewRiskDecision | Promise<ReviewRiskDecision>;
  /** List current PR command comments for authorized-command ingestion. */
  listCommandComments: () => Promise<ReviewCommandComment[]>;
  /** Read complete current PR comment and immutable label history. */
  readTriggerHistory?: (headSha: string) => Promise<GitHubTriggerHistoryEvent[]>;
}

/** Full live resolution retained by `read()` and consumed by `reduce()`. */
interface ReconcileSnapshot {
  state: CanonicalReconcileState;
  changeRequest: NormalizedChangeRequest;
  context: HostChangeContext;
  lane: LaneDecision;
  risk: ReviewRiskDecision;
  decision: SelfHostingDecision;
  evidence: Evidence[];
  ledgerReceipts: ReviewReceipt[];
  ledgerEnvelopes: ReceiptEnvelope[];
  capacities: SourceCapacity[];
  ciState: "pending" | "failure" | "success";
  nativeReview: SelfHostingGateReductionInput["nativeReview"];
  lifecycleTail: LifecycleTailProof | null;
  commandEvents: AuthorizedReviewCommandEvent[];
  receiptRefs: string[];
  inconsistencies: string[];
  ledgerVersion: number | null;
}

const EMPTY_CAPABILITIES = (actorIdentity: string): CapabilitySet => ({
  schemaVersion: 1,
  actorIdentity,
  permissions: [],
});

function guardKey(state: CanonicalReconcileState): string {
  return [
    state.repositoryId,
    state.pullRequestNumber,
    state.headSha,
    state.policyVersion,
    state.permissionVersion,
  ].join(":");
}

function resumableReservation(receipts: ReviewReceipt[]): ReviewReceipt | null {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const candidate = receipts[index];
    if (candidate?.action !== "reserved") continue;
    const requestKey = computeRequestKey(candidate.request);
    const terminal = receipts.slice(index + 1).some((receipt) =>
      computeRequestKey(receipt.request) === requestKey
      && ["acknowledged", "terminal-failure", "contaminated", "superseded", "source-superseded"]
        .includes(receipt.action));
    if (!terminal) return candidate;
  }
  return null;
}

function exclusiveTriggerInconsistencies(
  receipts: readonly ReviewReceipt[],
  history: readonly GitHubTriggerHistoryEvent[],
  observedEvidence: readonly Evidence[],
): string[] {
  const errors: string[] = [];
  const acknowledgements = receipts.filter((receipt) => receipt.action === "acknowledged"
    && receipt.payload.kind === "acknowledgement");
  for (const acknowledgement of acknowledgements) {
    if (acknowledgement.payload.kind !== "acknowledgement") continue;
    const trigger = acknowledgement.payload.trigger;
    if (trigger.occurredAt === null) {
      errors.push(`trigger-window-missing-time:${computeRequestKey(acknowledgement.request)}`);
      continue;
    }
    const providerHistory = history.filter((event) => event.providerIdentity === acknowledgement.request.sourceIdentity
      && event.classification === "trigger");
    const tombstones = receipts.filter((receipt) => receipt.action === "trigger-deleted"
      && receipt.payload.kind === "trigger-deleted"
      && receipt.request.sourceIdentity === acknowledgement.request.sourceIdentity);
    const liveTerminalEvidence = observedEvidence.filter((evidence) =>
      evidence.requirementId === acknowledgement.request.requirementId
      && evidence.sourceIdentity === acknowledgement.request.sourceIdentity
      && evidence.policyVersion === acknowledgement.request.policyVersion
      && evidence.rubricVersion === acknowledgement.request.rubricVersion
      && evidence.coverage === acknowledgement.request.coverage
      && evidence.coverageFromSha === acknowledgement.request.coverageFromSha
      && evidence.coverageThroughSha === acknowledgement.request.coverageThroughSha);
    const canonicalOwned = providerHistory.some((event) => event.eventId === trigger.eventId
      && (event.mutation === "created" || event.mutation === "applied"));
    const ownedTriggerEvent: TriggerEvent = {
      schemaVersion: 1,
      eventId: trigger.eventId,
      providerIdentity: acknowledgement.request.sourceIdentity,
      classification: "trigger",
      eventKind: trigger.eventKind,
      actorIdentity: trigger.actorIdentity,
      contentDigest: trigger.contentDigest,
      occurredAt: trigger.occurredAt,
      observedHeadSha: trigger.headSha,
      ownership: "controller-owned",
      mutation: trigger.eventKind === "comment" ? "created" : "applied",
      terminalForEventId: null,
      authenticatedEventRef: acknowledgement.evidenceUrlOrId ?? trigger.eventId,
    };
    const triggerEvents: TriggerEvent[] = [
      ownedTriggerEvent,
      ...providerHistory.map((event): TriggerEvent => ({
        schemaVersion: 1,
        eventId: event.eventId,
        providerIdentity: acknowledgement.request.sourceIdentity,
        classification: "trigger",
        eventKind: event.eventKind,
        actorIdentity: event.actorIdentity,
        contentDigest: event.contentDigest,
        occurredAt: event.occurredAt,
        observedHeadSha: event.observedHeadSha,
        ownership: event.eventId === trigger.eventId ? "controller-owned" : "unowned",
        mutation: event.mutation,
        terminalForEventId: event.eventId === trigger.eventId
          && ["edited", "removed"].includes(event.mutation) ? trigger.eventId : null,
        authenticatedEventRef: event.authenticatedEventRef,
      })),
      ...tombstones.map((receipt): TriggerEvent => {
        if (receipt.payload.kind !== "trigger-deleted") throw new Error("invalid trigger tombstone");
        const payload = receipt.payload;
        const owned = payload.actorIdentity === trigger.actorIdentity && payload.priorBodyDigest === trigger.contentDigest;
        return {
          schemaVersion: 1,
          eventId: `deleted:${payload.commentId}`,
          providerIdentity: acknowledgement.request.sourceIdentity,
          classification: "trigger",
          eventKind: "comment",
          actorIdentity: payload.actorIdentity,
          contentDigest: payload.priorBodyDigest,
          occurredAt: payload.deletedAt,
          observedHeadSha: payload.observedHeadSha,
          ownership: owned ? "controller-owned" : "unowned",
          mutation: "deleted",
          terminalForEventId: owned ? trigger.eventId : null,
          authenticatedEventRef: payload.authenticatedEventRef,
        };
      }),
    ];
    if (!canonicalOwned && (providerHistory.length > 0 || tombstones.length > 0 || liveTerminalEvidence.length > 0)) {
      triggerEvents.push({
        ...ownedTriggerEvent,
        eventId: `missing:${trigger.eventId}`,
        mutation: "deleted",
        terminalForEventId: trigger.eventId,
        authenticatedEventRef: "canonical-scan:owned-trigger-missing",
      });
    }
    for (const terminal of receipts.filter((receipt) =>
      computeRequestKey(receipt.request) === computeRequestKey(acknowledgement.request)
      && receipt.payload.kind === "terminal-evidence"
      && receipt.payload.terminalAt !== null)) {
      if (terminal.payload.kind !== "terminal-evidence" || terminal.payload.terminalAt === null) continue;
      triggerEvents.push({
        schemaVersion: 1,
        eventId: terminal.eventId,
        providerIdentity: acknowledgement.request.sourceIdentity,
        classification: "terminal",
        eventKind: "review",
        actorIdentity: acknowledgement.request.sourceIdentity,
        contentDigest: hashContent(terminal.evidenceUrlOrId ?? terminal.eventId),
        occurredAt: terminal.payload.terminalAt,
        observedHeadSha: acknowledgement.request.coverageThroughSha,
        ownership: "provider",
        mutation: "observed",
        terminalForEventId: trigger.eventId,
        authenticatedEventRef: terminal.evidenceUrlOrId ?? terminal.eventId,
      });
    }
    for (const evidence of liveTerminalEvidence) {
      triggerEvents.push({
        schemaVersion: 1,
        eventId: `provider-evidence:${evidence.reviewRunId}`,
        providerIdentity: acknowledgement.request.sourceIdentity,
        classification: "terminal",
        eventKind: "review",
        actorIdentity: acknowledgement.request.sourceIdentity,
        contentDigest: hashContent(evidence.evidenceUrlOrId),
        occurredAt: evidence.observedAt,
        observedHeadSha: evidence.headSha,
        ownership: "provider",
        mutation: "observed",
        terminalForEventId: trigger.eventId,
        authenticatedEventRef: evidence.evidenceUrlOrId,
      });
    }
    const result = reduceExclusiveTriggerWindow({
      schemaVersion: 1,
      requestKey: computeRequestKey(acknowledgement.request),
      providerIdentity: acknowledgement.request.sourceIdentity,
      generation: acknowledgement.request.generation,
      headSha: acknowledgement.request.coverageThroughSha,
      ownedTrigger: {
        eventId: trigger.eventId,
        actorIdentity: trigger.actorIdentity,
        contentDigest: trigger.contentDigest,
        occurredAt: trigger.occurredAt,
      },
    }, triggerEvents);
    errors.push(...result.contamination.map((reason) => `trigger-window:${reason}`));
    if (liveTerminalEvidence.length > 0 && result.status !== "terminal") {
      errors.push(`trigger-window:provider-evidence-outside-owned-window:${computeRequestKey(acknowledgement.request)}`);
    }
  }
  return errors;
}

/** Stable digest of the live-resolved author capability facts. */
function permissionDigest(capabilities: CapabilitySet): string {
  return hashContent(canonicalizePlainJson({
    actorIdentity: capabilities.actorIdentity,
    permissions: [...capabilities.permissions].sort(),
  }));
}

function singleRequirement(decision: SelfHostingDecision): ReviewRequirement | undefined {
  if (decision.requirements.length > 1) {
    throw new Error("reconcile-runtime: self-hosting policy must resolve at most one requirement");
  }
  return decision.requirements[0];
}

function toChangedPaths(context: HostChangeContext): ChangedPath[] {
  return context.changedPaths.map((change) => ({
    status: change.status,
    path: change.path,
    ...(change.previousPath === undefined ? {} : { previousPath: change.previousPath }),
  }));
}

/** Sources the policy licenses to run through the durable-record provider transport. */
function qualifiedDurableSources(
  policy: SelfHostingPolicy,
  requirement: ReviewRequirement,
): SourceQualificationDeclaration[] {
  return policy.qualifications.filter((declaration) => declaration.transport === "durable-record"
    && requirement.acceptableSources.some((accepted) => accepted.sourceKind === declaration.sourceKind
      && (accepted.qualifier === undefined || accepted.qualifier === declaration.qualifier))
    && qualifyIndependentAnalysisSource(declaration, requirement.rubricVersion).qualified);
}

/** Production reconcile runtime bound to one pull request's live host state. */
export class SelfHostingReconcileRuntime implements ReconcileRuntime {
  private readonly deps: ReconcileRuntimeDependencies;
  private snapshot: ReconcileSnapshot | null = null;

  constructor(deps: ReconcileRuntimeDependencies) {
    this.deps = deps;
  }

  async read(): Promise<CanonicalReconcileState> {
    const { host, policy, coordinates } = this.deps;
    const resolution = await host.resolveChangeRequest(coordinates.hostRef);
    const changeRequest = resolution.changeRequest;
    const context = resolution.context;

    const capabilities = await this.resolveAuthorCapabilities(context.author);
    const policyVersion = computePolicyVersion({ policy });
    const [lane, risk, ciState, nativeObservation, ledger, triggerHistory] = await Promise.all([
      this.deps.resolveLane({
        authorLogin: context.author.login,
        diffBaseSha: changeRequest.diffBaseSha,
        headSha: changeRequest.headSha,
        changes: toChangedPaths(context),
      }),
      Promise.resolve(this.deps.resolveRisk(toChangedPaths(context))),
      this.deps.resolveCiState(changeRequest.headSha),
      host.observeNativeReview({
        hostRef: coordinates.hostRef,
        headSha: changeRequest.headSha,
        authorIdentity: context.author.identity,
        expectsNativeReview: false,
      }),
      this.deps.store.readLedger(changeRequest.changeRequestId),
      this.deps.readTriggerHistory?.(changeRequest.headSha) ?? Promise.resolve([]),
    ]);

    const decision = resolveSelfHostingDecision({ policy, changeRequest, lane, risk });
    const ledgerValid = ledger.kind === "valid";
    const ledgerEnvelopes = ledgerValid ? ledger.receipts : [];
    const ledgerReceipts = ledgerEnvelopes.map((envelope) => envelope.receipt);
    const ledgerVersion = ledgerValid ? ledger.ledgerVersion : null;
    const providerEvidence = ledgerValid
      ? await this.resolveProviderEvidence(changeRequest, ledgerReceipts)
      : [];
    const inconsistencies = ledgerValid && this.deps.readTriggerHistory !== undefined
      ? exclusiveTriggerInconsistencies(ledgerReceipts, triggerHistory, providerEvidence)
      : ledgerValid ? [] : [...ledger.diagnostics];

    const receiptEvidence = extractAuthenticatedReceiptEvidence(ledgerEnvelopes);
    const lifecycleTail = await this.resolveLifecycleTail(
      changeRequest,
      decision,
      policyVersion,
      receiptEvidence,
    );
    const evidence = [
      ...providerEvidence,
      ...receiptEvidence,
    ];
    const capacities = await this.resolveCapacities(decision);
    const commandEvents = await this.resolveCommandEvents(changeRequest, decision, evidence, ledgerReceipts);

    const state: CanonicalReconcileState = {
      repositoryId: coordinates.repositoryId,
      pullRequestNumber: coordinates.pullRequestNumber,
      headSha: changeRequest.headSha,
      policyVersion,
      permissionVersion: permissionDigest(capabilities),
      ledgerVersion,
    };

    this.snapshot = {
      state,
      changeRequest,
      context,
      lane,
      risk,
      decision,
      evidence,
      ledgerReceipts,
      ledgerEnvelopes,
      capacities,
      ciState,
      nativeReview: nativeObservation.nativeReview,
      lifecycleTail,
      commandEvents,
      receiptRefs: ledgerEnvelopes.map((envelope) => envelope.durableRecordId),
      inconsistencies,
      ledgerVersion,
    };
    return state;
  }

  reduce(state: CanonicalReconcileState, now: Date): Promise<ReconcileDecision> {
    try {
      return Promise.resolve(this.reduceSnapshot(state, now));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Pure reduction over the cached snapshot; no side effects so it is safe to re-run. */
  private reduceSnapshot(state: CanonicalReconcileState, now: Date): ReconcileDecision {
    const snapshot = this.snapshot;
    if (snapshot === null || guardKey(snapshot.state) !== guardKey(state) || snapshot.ledgerVersion !== state.ledgerVersion) {
      throw new Error("reconcile-runtime: reduce called without a matching cached read");
    }

    const headUpdate = state.ledgerVersion === null
      ? { kind: "none" as const, reason: "no-authorization" as const }
      : planHeadUpdateConsumption({
          receipts: snapshot.ledgerReceipts,
          currentHeadSha: snapshot.changeRequest.headSha,
          expectedLedgerVersion: state.ledgerVersion,
          consumedAt: now,
        });
    const transitionReceipts = headUpdate.kind === "consume" ? headUpdate.receipts : [];
    const commandReceipts: ReviewReceipt[] = [];
    const receiptsToAppend: ReviewReceipt[] = [...transitionReceipts];
    let refreshRequest: ReviewRequest | null = null;
    let requestReservation: ReviewReceipt | null = null;
    for (const event of state.ledgerVersion === null || transitionReceipts.length > 0 ? [] : snapshot.commandEvents) {
      const ledgerVersion = state.ledgerVersion;
      if (ledgerVersion === null) break;
      const requirement = snapshot.decision.requirements.find((entry) => entry.id === event.command.requirementId);
      if (requirement === undefined) continue;
      if (event.command.kind === "refresh") {
        const plan = planCommandRefresh({
          event,
          changeRequest: snapshot.changeRequest,
          requirement,
          expectedLedgerVersion: ledgerVersion,
          priorReceipts: [...snapshot.ledgerReceipts, ...commandReceipts],
          qualifiedSourceIdentities: qualifiedDurableSources(this.deps.policy, requirement)
            .map((declaration) => declaration.sourceIdentity),
          reviewedChainHead: snapshot.evidence
            .filter((item) => item.requirementId === requirement.id
              && item.result === "clean"
              && item.policyVersion === requirement.policyVersion
              && item.rubricVersion === requirement.rubricVersion)
            .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]?.coverageThroughSha ?? null,
          controllerActorIdentity: this.deps.policy.providerIdentities.appBotUserId,
        });
        if (plan.ok) {
          refreshRequest = plan.request;
          commandReceipts.push(plan.reservation);
          if (!plan.replay) {
            requestReservation = plan.reservation;
          }
          break;
        }
        continue;
      }
      const receipt = createDirectCommandReceipt({
        event,
        changeRequest: snapshot.changeRequest,
        requirement,
        expectedLedgerVersion: ledgerVersion,
        priorReceipts: [...snapshot.ledgerReceipts, ...commandReceipts],
      });
      if (receipt.ok) {
        commandReceipts.push(receipt.receipt);
        if (!receipt.replay) {
          receiptsToAppend.push(receipt.receipt);
        }
        break;
      }
    }

    const authorizedDismissers = [
      ...new Set(snapshot.commandEvents
        .filter((event) => event.command.kind === "dismiss")
        .map((event) => event.actorIdentity)),
    ];

    const reduction = reduceSelfHostingGate({
      policy: this.deps.policy,
      changeRequest: snapshot.changeRequest,
      lane: snapshot.lane,
      risk: snapshot.risk,
      evidence: snapshot.evidence,
      receipts: [...snapshot.ledgerReceipts, ...transitionReceipts, ...commandReceipts],
      capacities: snapshot.capacities,
      readiness: {
        draft: snapshot.context.isDraft,
        mergeability: snapshot.context.mergeability,
        baseFresh: true,
      },
      ciState: snapshot.ciState,
      nativeReview: snapshot.nativeReview,
      authorizedDismissers,
      inconsistencies: [
        ...snapshot.inconsistencies,
        ...(headUpdate.kind === "ambiguous" ? [`head-update-${headUpdate.reason}`] : []),
      ],
      ledgerVersion: state.ledgerVersion === null
        ? null
        : state.ledgerVersion + receiptsToAppend.length,
      lifecycleTail: snapshot.lifecycleTail,
      receiptRefs: snapshot.receiptRefs,
      actorIdentity: this.deps.policy.providerIdentities.appBotUserId,
      prAuthorIdentity: snapshot.context.author.identity,
      now,
    });

    const effectiveReceipts = [...snapshot.ledgerReceipts, ...transitionReceipts, ...commandReceipts];
    const priorReservation = resumableReservation(effectiveReceipts);
    const selectedRequest = headUpdate.kind === "ambiguous"
      ? null
      : refreshRequest ?? reduction.request ?? priorReservation?.request ?? null;
    const selectedReservation = requestReservation ?? priorReservation;
    const reservationEnvelope = selectedReservation === null
      ? null
      : snapshot.ledgerEnvelopes.find((entry) =>
          entry.receipt.receiptHash === selectedReservation.receiptHash) ?? null;
    return {
      request: selectedRequest,
      receiptsToAppend: [...receiptsToAppend, ...reduction.receiptsToAppend],
      requestReservation: selectedReservation,
      reservationEnvelope,
      projection: reduction.projection,
      action: deriveReviewGateAction({
        repositoryId: snapshot.changeRequest.repositoryId,
        changeRequestId: snapshot.changeRequest.changeRequestId,
        headSha: snapshot.changeRequest.headSha,
        request: selectedRequest,
        projection: reduction.projection,
      }),
    };
  }

  async appendReceipts(receipts: ReviewReceipt[], expectedLedgerVersion: number): Promise<number> {
    let version = expectedLedgerVersion;
    for (const receipt of receipts) {
      const appended = await this.deps.store.appendReceipt(receipt, version);
      version = appended.ledgerVersion;
    }
    return version;
  }

  async reserve(
    request: ReviewRequest,
    expectedLedgerVersion: number,
    plannedReservation: ReviewReceipt | null = null,
  ): Promise<{ envelope: ReceiptEnvelope; created: boolean } | null> {
    const { provider, store } = this.deps;
    const qualification = await provider.qualifyRequest(request);
    if (!qualification.qualified) return null;
    const changeRequestId = request.changeRequestId;
    return reserveRequest({
      request,
      expectedLedgerVersion,
      appendReservation: async (reservedRequest, version) => {
        const receipt = plannedReservation ?? createReceipt({
          eventId: `request:${computeRequestKey(reservedRequest)}:reserved`,
          previousLedgerVersion: version,
          action: "reserved",
          request: reservedRequest,
          result: null,
          evidenceUrlOrId: null,
          findingIds: [],
          payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
        });
        if (computeRequestKey(receipt.request) !== computeRequestKey(reservedRequest)) {
          throw new Error("reconcile-runtime: planned reservation does not match the request or ledger");
        }
        const prior = await store.readLedger(changeRequestId);
        const existing = prior.kind === "valid"
          ? prior.receipts.find((entry) => entry.receipt.receiptHash === receipt.receiptHash) ?? null
          : null;
        if (existing !== null) return { envelope: existing, created: false };
        if (receipt.previousLedgerVersion !== version) {
          throw new Error("reconcile-runtime: planned reservation does not match the request or ledger");
        }
        await store.appendReceipt(receipt, version);
        const ledger = await store.readLedger(changeRequestId);
        const envelope = ledger.kind === "valid"
          ? ledger.receipts.find((entry) => entry.receipt.receiptHash === receipt.receiptHash) ?? null
          : null;
        if (envelope === null) throw new Error("reconcile-runtime: reservation not durable after append");
        return { envelope, created: true };
      },
      confirmReservation: async (requestKey) => {
        const ledger = await store.readLedger(changeRequestId);
        if (ledger.kind !== "valid") return { canonical: false, envelope: null };
        const envelope = ledger.receipts.find((entry) => entry.receipt.action === "reserved"
          && computeRequestKey(entry.receipt.request) === requestKey) ?? null;
        return { canonical: envelope !== null, envelope };
      },
    });
  }

  async confirmPending(
    request: ReviewRequest,
    reservation: ReceiptEnvelope,
    projection: GateProjection,
  ): Promise<boolean> {
    if (projection.conclusion !== "pending" || projection.ledgerVersion !== reservation.ledgerVersion) return false;
    const ledger = await this.deps.store.readLedger(request.changeRequestId);
    if (ledger.kind !== "valid" || ledger.ledgerVersion !== reservation.ledgerVersion) return false;
    const requestKey = computeRequestKey(request);
    const receiptConfirmed = ledger.receipts.some((entry) =>
      entry.ledgerVersion === reservation.ledgerVersion
      && entry.receipt.receiptHash === reservation.receipt.receiptHash
      && entry.receipt.request.generation === request.generation
      && computeRequestKey(entry.receipt.request) === requestKey);
    if (!receiptConfirmed) return false;
    return this.deps.host.confirmPendingProjection({
      hostRef: this.deps.coordinates.hostRef,
      headSha: request.coverageThroughSha,
      changeSetId: request.changeSetId,
      projection,
      mode: this.deps.mode,
      expectedAppId: this.deps.expectedAppId,
    });
  }

  async execute(request: ReviewRequest, reservation: ReceiptEnvelope): Promise<RequestExecutionResult> {
    const { store, provider } = this.deps;
    return executeConfirmedRequest({
      request,
      reservation,
      invoke: (invokedRequest) => provider.request(invokedRequest),
      appendAcknowledgement: async (acknowledgement, reservation) => {
        const receipt = createReceipt({
          eventId: `request:${computeRequestKey(reservation.receipt.request)}:acknowledged`,
          previousLedgerVersion: reservation.ledgerVersion,
          action: "acknowledged",
          request: reservation.receipt.request,
          result: null,
          evidenceUrlOrId: acknowledgement.durableRef ?? acknowledgement.requestIdentity,
          findingIds: [],
          payload: {
            kind: "acknowledgement",
            acknowledgedAt: acknowledgement.acknowledgedAt,
            acknowledgementRef: acknowledgement.durableRef ?? acknowledgement.requestIdentity,
            trigger: {
              mechanism: reservation.receipt.request.requestMechanism,
              eventKind: acknowledgement.trigger.eventKind,
              eventId: acknowledgement.trigger.eventId,
              actorIdentity: acknowledgement.trigger.actorIdentity,
              occurredAt: acknowledgement.trigger.occurredAt,
              headSha: acknowledgement.trigger.headSha,
              contentDigest: acknowledgement.trigger.contentDigest,
            },
          },
        });
        await store.appendReceipt(receipt, reservation.ledgerVersion);
      },
      appendTerminalFailure: async (reservation, failure) => {
        const receipt = createReceipt({
          eventId: `request:${computeRequestKey(reservation.receipt.request)}:terminal-failure`,
          previousLedgerVersion: reservation.ledgerVersion,
          action: "terminal-failure",
          request: reservation.receipt.request,
          result: "unavailable",
          reason: failure.disposition === "pre-effect" ? failure.reason : `ambiguous:${failure.reason}`,
          evidenceUrlOrId: null,
          findingIds: [],
          payload: { kind: "terminal-evidence", terminalAt: null, evidenceRefs: [], findingIds: [] },
        });
        await store.appendReceipt(receipt, reservation.ledgerVersion);
      },
    });
  }

  /** Revalidate a human command receipt against the latest cached event and live actor capability. */
  async authorizesCommandReceipt(receipt: ReviewReceipt): Promise<boolean> {
    const snapshot = this.snapshot;
    if (snapshot === null) return false;
    const refreshLifecycle = receipt.action === "acknowledged" || receipt.action === "terminal-failure";
    const event = snapshot.commandEvents.find((candidate) => candidate.actorIdentity === receipt.request.actorIdentity
      && candidate.command.requirementId === receipt.request.requirementId
      && (refreshLifecycle || (candidate.durableRef === receipt.evidenceUrlOrId
        && candidate.command.reason === receipt.reason))
      && (candidate.eventId === receipt.eventId || (candidate.command.kind === "refresh" && refreshLifecycle)));
    if (event === undefined) return false;
    const actionMatches = event.command.kind === "require"
      ? receipt.action === "required" && receipt.request.sourceIdentity === "review-gate-command"
      : event.command.kind === "waive"
        ? receipt.action === "waived" && receipt.request.sourceIdentity === "review-gate-command"
        : event.command.kind === "dismiss"
          ? receipt.action === "dismissed"
            && receipt.request.sourceIdentity === event.command.sourceIdentity
            && receipt.findingIds.length === 1
            && receipt.findingIds[0] === event.command.findingId
          : ["reserved", "acknowledged", "terminal-failure"].includes(receipt.action)
            && (event.command.sourceIdentity === "auto"
              || receipt.request.sourceIdentity === event.command.sourceIdentity);
    if (!actionMatches) return false;
    try {
      const capabilities = await this.deps.host.resolveActorCapabilities({
        login: event.actorLogin,
        expectedActorId: event.actorIdentity,
      });
      return capabilities.actorIdentity === event.actorIdentity && capabilities.permissions.includes(event.permission);
    } catch {
      return false;
    }
  }

  async publish(projection: GateProjection): Promise<void> {
    const snapshot = this.snapshot;
    if (snapshot === null) throw new Error("reconcile-runtime: publish called before read");
    await this.deps.host.publishVerdict({
      hostRef: this.deps.coordinates.hostRef,
      headSha: snapshot.changeRequest.headSha,
      changeSetId: snapshot.changeRequest.changeSetId,
      projection,
      mode: this.deps.mode,
      expectedAppId: this.deps.expectedAppId,
      anchorReceiptCount: snapshot.ledgerVersion,
      readCurrentState: async () => {
        const resolution = await this.deps.host.resolveChangeRequest(this.deps.coordinates.hostRef);
        return {
          headSha: resolution.changeRequest.headSha,
          changeSetId: resolution.changeRequest.changeSetId,
        };
      },
    });
  }

  private async resolveAuthorCapabilities(author: HostChangeContext["author"]): Promise<CapabilitySet> {
    const address: ActorAddress = { login: author.login, expectedActorId: author.identity };
    try {
      return await this.deps.host.resolveActorCapabilities(address);
    } catch {
      return EMPTY_CAPABILITIES(author.identity);
    }
  }

  private async resolveLifecycleTail(
    changeRequest: NormalizedChangeRequest,
    decision: SelfHostingDecision,
    policyVersion: string,
    receiptEvidence: Evidence[],
  ): Promise<LifecycleTailProof | null> {
    const requirement = singleRequirement(decision);
    if (requirement === undefined) return null;
    const reviewed = receiptEvidence
      .filter((item) => item.requirementId === requirement.id
        && item.policyVersion === policyVersion
        && item.rubricVersion === requirement.rubricVersion
        && item.baseRef === changeRequest.baseRef
        && item.diffBaseSha === changeRequest.diffBaseSha
        && item.coverageThroughSha !== changeRequest.headSha)
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
    if (reviewed === undefined) return null;
    const reviewedScope = {
      baseRef: reviewed.baseRef,
      diffBaseSha: reviewed.diffBaseSha,
      policyVersion: reviewed.policyVersion,
      rubricVersion: reviewed.rubricVersion,
      sourceIdentity: reviewed.sourceIdentity,
    };
    const currentScope = {
      baseRef: changeRequest.baseRef,
      diffBaseSha: changeRequest.diffBaseSha,
      policyVersion,
      rubricVersion: requirement.rubricVersion,
      sourceIdentity: reviewed.sourceIdentity,
    };
    return this.deps.lifecycleTailAdapter.resolveLifecycleTail({
      predicateId: this.deps.policy.lifecycleTailPredicate.id,
      reviewedThroughSha: reviewed.coverageThroughSha,
      currentHeadSha: changeRequest.headSha,
      reviewed: reviewedScope,
      current: currentScope,
    });
  }

  private async resolveProviderEvidence(
    changeRequest: NormalizedChangeRequest,
    receipts: ReviewReceipt[],
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    const acknowledged = receipts.filter((receipt) => receipt.action === "acknowledged"
      && receipt.request.coverageThroughSha === changeRequest.headSha);
    const seen = new Set<string>();
    for (const receipt of acknowledged) {
      const requestIdentity = computeRequestKey(receipt.request);
      if (seen.has(requestIdentity)) continue;
      seen.add(requestIdentity);
      const terminalAlreadyRecorded = receipts.some((candidate) =>
        computeRequestKey(candidate.request) === requestIdentity
        && candidate.payload.kind === "terminal-evidence");
      if (terminalAlreadyRecorded) continue;
      const observations = await this.deps.provider.observe(requestIdentity);
      const normalized = await this.deps.provider.normalizeEvidence(observations);
      evidence.push(...normalized.filter((item) =>
        item.requirementId === receipt.request.requirementId
        && item.sourceIdentity === receipt.request.sourceIdentity
        && item.policyVersion === receipt.request.policyVersion
        && item.rubricVersion === receipt.request.rubricVersion
        && item.baseRef === changeRequest.baseRef
        && item.diffBaseSha === changeRequest.diffBaseSha
        && item.coverage === receipt.request.coverage
        && item.coverageFromSha === receipt.request.coverageFromSha
        && item.coverageThroughSha === receipt.request.coverageThroughSha
        && item.headSha === changeRequest.headSha
        && item.changeSetId === changeRequest.changeSetId));
    }
    return evidence;
  }

  private async resolveCapacities(decision: SelfHostingDecision): Promise<SourceCapacity[]> {
    const sources = new Set<string>();
    for (const requirement of decision.requirements) {
      for (const declaration of qualifiedDurableSources(this.deps.policy, requirement)) {
        sources.add(declaration.sourceIdentity);
      }
    }
    return Promise.all([...sources].map((sourceIdentity) => this.deps.provider.readCapacity(sourceIdentity)));
  }

  private async resolveCommandEvents(
    changeRequest: NormalizedChangeRequest,
    decision: SelfHostingDecision,
    evidence: Evidence[],
    ledgerReceipts: ReviewReceipt[],
  ): Promise<AuthorizedReviewCommandEvent[]> {
    const requirement = singleRequirement(decision);
    if (requirement === undefined) return [];
    const comments = await this.deps.listCommandComments();
    const scope = {
      changeSetId: changeRequest.changeSetId,
      policyVersion: requirement.policyVersion,
      rubricVersion: requirement.rubricVersion,
    };
    const result = await ingestReviewCommands({
      comments,
      commandContext: {
        knownRequirementIds: decision.requirements.map((entry) => entry.id),
        knownFindings: evidence.flatMap((item) => item.findings.map((finding) => ({
          sourceIdentity: item.sourceIdentity,
          findingId: finding.findingId,
        }))),
        allowedSourceIdentities: this.deps.policy.qualifications.map((declaration) => declaration.sourceIdentity),
      },
      currentScope: scope,
      expectedScope: scope,
      receiptedEventIds: ledgerReceipts.map((receipt) => receipt.eventId),
      resolveCapabilities: (actor) => this.deps.host.resolveActorCapabilities(actor),
    });
    return result.accepted;
  }

}
