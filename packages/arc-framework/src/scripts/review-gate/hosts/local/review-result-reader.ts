/** Git-common composition of immutable local, frontline, and hosted producer evidence. */

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../../../../lib/kernel/index.js";
import { FrontlineOutcomeRecordSchema, type FrontlineOutcomeRecord } from "../../core/advisory-records.js";
import { validateReviewReceipt } from "../../core/gate-contract-v2.js";
import { LocalReviewSourceSchema } from "../../core/local-review-source.js";
import { ReviewOperationStateSchema } from "../../core/operation-state-schema.js";
import type {
  ForwardReviewReceiptIndex,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateSnapshotIndex,
  ReviewResultReader,
} from "../../core/ports.js";
import type { ReviewResult } from "../../core/review-result.js";
import type { ReviewOperationStateSnapshotRecord } from "../../core/ports.js";
import type { LaneProgressState } from "../../core/operation-state-schema.js";
import { projectHostedFinding } from "../../hosted/await.js";
import { laneSubjectOwnerMatches } from "../../core/lane-admission.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LocalState = Extract<ReviewOperationStateSnapshotRecord["state"], { kind: "local-review" }>;
type FrontlineState = Extract<ReviewOperationStateSnapshotRecord["state"], { kind: "frontline-run" }>;
type ProducerCandidate =
  | { kind: "local-review"; record: ReviewOperationStateSnapshotRecord }
  | { kind: "frontline-run"; record: ReviewOperationStateSnapshotRecord }
  | { kind: "hosted"; record: ReviewOperationStateSnapshotRecord; attempt: LaneAttempt };

function immutableProducerOutcome(attempt: LaneAttempt): LaneAttempt["outcome"] {
  return attempt.outcome === "settled-findings" ? "findings" : attempt.outcome;
}

function findProducerCandidates(
  records: readonly ReviewOperationStateSnapshotRecord[],
  producerId: string,
): ProducerCandidate[] {
  const candidates: ProducerCandidate[] = [];
  for (const record of records) {
    if ((record.state.kind === "local-review" || record.state.kind === "frontline-run")
      && record.state.operationId === producerId) {
      candidates.push({ kind: record.state.kind, record });
    }
    if (record.state.kind !== "lane-progress") continue;
    for (const attempt of record.state.attempts) {
      if (attempt.hosted !== undefined && attempt.attemptId === producerId) {
        candidates.push({ kind: "hosted", record, attempt });
      }
    }
  }
  return candidates;
}

function frontlineOutcomeMatchesState(
  record: FrontlineOutcomeRecord,
  state: FrontlineState,
  originalOutcome: LaneAttempt["outcome"],
): boolean {
  return record.operationId === state.operationId
    && record.repositoryId === state.repositoryId
    && record.sourceIdentity === state.sourceIdentity
    && record.outcome.outcome === state.outcome
    && record.outcome.outcome === originalOutcome
    && record.outcome.target.targetId === state.targetId
    && record.outcome.pass === state.logicalPass
    && canonicalize(record.responseBinding ?? null) === canonicalize(state.responseBinding ?? null);
}

function frontlineAttemptMatchesState(
  attempt: LaneAttempt,
  state: FrontlineState,
  record: FrontlineOutcomeRecord,
): boolean {
  return attempt.attemptId === state.operationId
    && attempt.logicalPass === state.logicalPass
    && attempt.retryGeneration === state.retryGeneration
    && attempt.sourceId === state.sourceIdentity
    && attempt.headSha === record.outcome.target.headSha;
}

function frontlineAdmissionMatches(
  attempt: LaneAttempt,
  state: FrontlineState,
  record: FrontlineOutcomeRecord,
): boolean {
  const admission = attempt.frontline?.admission;
  const admittedSource = admission?.frontlineReview.source;
  if (admission === undefined || admittedSource === undefined || admittedSource === null) return false;
  const expectedSourceBindingId = canonicalDigest(state.responseBinding === undefined
    ? { domain: "arc.review-gate.frontline-source-binding/v1", source: admittedSource }
    : { domain: "arc.review-gate.frontline-source-binding/v1", source: admittedSource,
        responseBinding: state.responseBinding });
  return record.outcome.pass === admission.logicalPass
    && record.outcome.maxPasses === admission.maxPasses
    && canonicalize(record.outcome.source) === canonicalize(admittedSource)
    && state.policyVersion === admission.policyVersion
    && state.sourceBindingId === expectedSourceBindingId
    && canonicalize(state.lineage) === canonicalize(admission.lineage)
    && canonicalize(record.outcome.target) === canonicalize(admission.target);
}

function localAttemptMatchesState(attempt: LaneAttempt, state: LocalState): boolean {
  const local = attempt.local;
  if (local === undefined) return false;
  return attempt.attemptId === state.operationId
    && attempt.logicalPass === state.logicalPass
    && attempt.retryGeneration === state.retryGeneration
    && attempt.sourceId === state.laneSourceId
    && attempt.headSha === state.target.headSha
    && local.requestId === state.requestId
    && local.scopeMode === state.scopeMode
    && canonicalize({ requestedCoverage: local.requestedCoverage,
      ...(local.correctionScope === undefined ? {} : { correctionScope: local.correctionScope }) })
      === canonicalize(state.coverageAdmission)
    && canonicalize(local.target) === canonicalize(state.target)
    && canonicalize(local.vehicle) === canonicalize(state.vehicle)
    && canonicalize(local.deliveryAdmission ?? null) === canonicalize(state.deliveryAdmission ?? null);
}

function localSourceMatchesState(
  source: ReturnType<typeof LocalReviewSourceSchema.parse>,
  state: LocalState,
): boolean {
  return source.sourceDigest === state.sourceDigest
    && source.repositoryId === state.repositoryId
    && source.targetId === state.targetId;
}

function localReceiptMatchesOutcome(
  receipt: ReturnType<typeof validateReviewReceipt>,
  outcome: LaneAttempt["outcome"],
): receipt is ReturnType<typeof validateReviewReceipt> & { result: "clean" | "findings" } {
  return (receipt.result === "clean" || receipt.result === "findings")
    && receipt.result === outcome;
}

function localEvidenceMatchesState(
  receipt: ReturnType<typeof validateReviewReceipt>,
  outcome: LaneAttempt["outcome"],
  attempt: LaneAttempt,
  state: LocalState,
  source: ReturnType<typeof LocalReviewSourceSchema.parse>,
): receipt is ReturnType<typeof validateReviewReceipt> & { result: "clean" | "findings" } {
  return localReceiptMatchesOutcome(receipt, outcome)
    && localAttemptMatchesState(attempt, state)
    && localSourceMatchesState(source, state);
}

function localResultDigest(
  state: LocalState,
  local: NonNullable<LaneAttempt["local"]>,
  receipt: ReturnType<typeof validateReviewReceipt>,
): CanonicalDigest {
  return canonicalDigest({
    domain: "arc.review.local-result/v1",
    producerId: state.operationId,
    receipt,
    admission: {
      lineage: state.lineage,
      logicalPass: state.logicalPass,
      retryGeneration: state.retryGeneration,
      laneSourceId: state.laneSourceId,
      target: state.target,
      requirement: state.requirement,
      request: state.request,
      attestation: state.attestation,
      policyBindingDigest: state.policyBindingDigest,
      sourceDigest: state.sourceDigest,
      guidanceDigest: state.guidanceDigest,
      requestedCoverage: local.requestedCoverage,
      correctionScope: local.correctionScope ?? null,
      effectiveCoverage: local.effectiveCoverage,
      scopeMode: state.scopeMode,
      deliveryAdmission: state.deliveryAdmission ?? null,
    },
  });
}

function hostedProducerMatchesOwner(
  state: LaneProgressState,
  attempt: LaneAttempt,
): boolean {
  const hosted = attempt.hosted;
  return state.lane === "standard"
    && hosted !== undefined
    && state.repositoryId === hosted.reviewTarget.repositoryId
    && laneSubjectOwnerMatches(state.lineage, hosted.admission.lineage);
}

function hostedProducerMatchesAdmission(attempt: LaneAttempt): boolean {
  const hosted = attempt.hosted;
  if (hosted === undefined || hosted.handle === undefined || hosted.sealedResult === undefined) return false;
  const originalOutcome = immutableProducerOutcome(attempt);
  return attempt.terminalProducer
    && (originalOutcome === "clean" || originalOutcome === "findings")
    && hosted.sealedResult.outcome === originalOutcome
    && attempt.logicalPass === hosted.admission.logicalPass
    && attempt.sourceId === hosted.admission.sourceId
    && attempt.headSha === hosted.reviewTarget.headSha;
}

function uniqueProducerAttempt(
  records: readonly ReviewOperationStateSnapshotRecord[],
  operationId: string,
  kind: "local" | "frontline",
): { lane: LaneProgressState; attempt: LaneAttempt } {
  const matches: { lane: LaneProgressState; attempt: LaneAttempt }[] = [];
  for (const { state } of records) {
    if (state.kind !== "lane-progress") continue;
    for (const attempt of state.attempts) {
      if (kind === "local"
        ? attempt.local?.operationId === operationId
        : attempt.frontline?.admission.operationId === operationId) {
        matches.push({ lane: state, attempt });
      }
    }
  }
  if (matches.length === 0) {
    throw new LocalReviewResultReaderError("missing-result", `${kind} producer admission is unavailable`);
  }
  if (matches.length !== 1) {
    throw new LocalReviewResultReaderError("ambiguous-result", `${kind} producer has multiple admissions`);
  }
  const match = matches[0];
  if (match === undefined) throw new LocalReviewResultReaderError("missing-result");
  return match;
}

function terminalProducerAttempt(attempt: LaneAttempt, kind: "local" | "frontline"): boolean {
  const coverage = kind === "local"
    ? attempt.local?.effectiveCoverage
    : attempt.frontline?.effectiveCoverage;
  const outcome = immutableProducerOutcome(attempt);
  return coverage !== undefined && coverage !== null
    && attempt.terminalProducer
    && (outcome === "clean" || outcome === "findings");
}

function producerLaneMatchesOwner(
  lane: LaneProgressState,
  producer: LocalState | FrontlineState,
  expectedLane: "standard" | "frontline",
): boolean {
  return lane.lane === expectedLane
    && lane.repositoryId === producer.repositoryId
    && laneSubjectOwnerMatches(lane.lineage, producer.lineage);
}

/** Stable read failure for unavailable, ambiguous, or corrupt producer evidence. */
export class LocalReviewResultReaderError extends Error {
  constructor(
    public readonly code: "missing-producer" | "missing-result" | "ambiguous-result" | "corrupt-result",
    message: string = code,
  ) {
    super(message);
    this.name = "LocalReviewResultReaderError";
  }
}

/** Dependencies composed from the existing native source stores. */
export interface LocalReviewResultReaderDependencies {
  operationIndex: ReviewOperationStateSnapshotIndex;
  receiptIndex: ForwardReviewReceiptIndex;
  outcomeStore: FrontlineOutcomeStore;
  sourceStore: LocalReviewSourceStore;
}

/** Resolve exact immutable producer evidence without introducing another persistence owner. */
export class LocalReviewResultReader implements ReviewResultReader {
  constructor(private readonly dependencies: LocalReviewResultReaderDependencies) {}

  async readResult(producerId: string): Promise<ReviewResult> {
    try {
      const snapshot = await this.dependencies.operationIndex.readOperationSnapshot();
      if (snapshot.status !== "complete") {
        throw new LocalReviewResultReaderError(
          "corrupt-result",
          `operation snapshot is ${snapshot.status}: ${snapshot.reason}`,
        );
      }
      const records = snapshot.records.map((record) => ({
        version: record.version,
        state: ReviewOperationStateSchema.parse(record.state),
      }));
      const candidates = findProducerCandidates(records, producerId);
      if (candidates.length === 0) {
        throw new LocalReviewResultReaderError("missing-producer", `No review producer matches '${producerId}'.`);
      }
      if (candidates.length !== 1) {
        throw new LocalReviewResultReaderError("ambiguous-result");
      }
      const candidate = candidates[0];
      if (candidate?.kind === "local-review") {
        return await this.readLocalResult(candidate.record, records);
      }
      if (candidate?.kind === "frontline-run") {
        return await this.readFrontlineResult(candidate.record, records);
      }
      if (candidate?.kind === "hosted") {
        return this.readHostedResult(candidate.record, candidate.attempt);
      }
      throw new LocalReviewResultReaderError("missing-result");
    } catch (error) {
      if (error instanceof LocalReviewResultReaderError) throw error;
      throw new LocalReviewResultReaderError(
        "corrupt-result",
        error instanceof Error ? error.message : "producer result cannot be validated",
      );
    }
  }

  private async readLocalResult(
    producer: ReviewOperationStateSnapshotRecord,
    records: readonly ReviewOperationStateSnapshotRecord[],
  ): Promise<ReviewResult> {
    const state = producer.state;
    if (state.kind !== "local-review") {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer kind mismatch");
    }
    const { lane, attempt } = uniqueProducerAttempt(records, state.operationId, "local");
    const local = attempt.local;
    const originalOutcome = immutableProducerOutcome(attempt);
    if (!producerLaneMatchesOwner(lane, state, "standard")) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer lane owner mismatch");
    }
    if (local === undefined || !terminalProducerAttempt(attempt, "local")) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer admission is not terminal");
    }
    const [entries, source] = await Promise.all([
      this.dependencies.receiptIndex.readReceiptEntries(state.targetId),
      this.dependencies.sourceStore.readSource(state.sourceRef),
    ]);
    const matchingEntries = entries.filter(({ receipt }) => receipt.requestId === state.requestId);
    if (matchingEntries.length === 0) {
      throw new LocalReviewResultReaderError("missing-result", "local producer receipt is unavailable");
    }
    if (matchingEntries.length !== 1) {
      throw new LocalReviewResultReaderError("ambiguous-result", "local producer has multiple terminal receipts");
    }
    if (source === null) {
      throw new LocalReviewResultReaderError("missing-result", "local producer source is unavailable");
    }
    const canonicalSource = LocalReviewSourceSchema.parse(source);
    const entry = matchingEntries[0];
    if (entry === undefined) {
      throw new LocalReviewResultReaderError("missing-result", "local producer receipt is unavailable");
    }
    const exactReceipt = await this.dependencies.receiptIndex.readReceiptReference(entry.durableEvidenceRef);
    if (exactReceipt === null || canonicalize(exactReceipt) !== canonicalize(entry.receipt)) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer receipt reference mismatch");
    }
    const receipt = validateReviewReceipt(state.target, state.requirement, state.request, entry.receipt);
    if (!localEvidenceMatchesState(receipt, originalOutcome, attempt, state, canonicalSource)) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer admission mismatch");
    }
    const resultDigest = localResultDigest(state, local, receipt);
    return {
      kind: "attested-local",
      producerId: state.operationId,
      repositoryId: state.repositoryId,
      target: state.target,
      sourceIdentity: state.request.evaluatorIdentity,
      originalOutcome: receipt.result,
      findings: receipt.findings,
      resultDigest,
      admission: {
        lineage: state.lineage,
        logicalPass: state.logicalPass,
        retryGeneration: state.retryGeneration,
        requestedCoverage: local.requestedCoverage,
        effectiveCoverage: local.effectiveCoverage,
        scopeMode: state.scopeMode,
        policyVersion: state.policyVersion,
        ...(local.correctionScope === undefined
          ? {}
          : { correctionScope: local.correctionScope }),
      },
      receiptRef: entry.durableEvidenceRef,
      localSourceRef: state.sourceRef,
      vehicle: state.vehicle,
      requirement: state.requirement,
      request: state.request,
      ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
    };
  }

  private async readFrontlineResult(
    producer: ReviewOperationStateSnapshotRecord,
    records: readonly ReviewOperationStateSnapshotRecord[],
  ): Promise<ReviewResult> {
    const state = producer.state;
    if (state.kind !== "frontline-run") {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer kind mismatch");
    }
    const { lane, attempt } = uniqueProducerAttempt(records, state.operationId, "frontline");
    const frontline = attempt.frontline;
    const originalOutcome = immutableProducerOutcome(attempt);
    if (!producerLaneMatchesOwner(lane, state, "frontline")) {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer lane owner mismatch");
    }
    if (frontline === undefined || !terminalProducerAttempt(attempt, "frontline")) {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer admission is not terminal");
    }
    const reading = await this.dependencies.outcomeStore.readOutcome(state.operationId);
    if (reading.record === null || reading.outcomeRef === null || reading.version <= 0) {
      throw new LocalReviewResultReaderError("missing-result", "frontline producer outcome is unavailable");
    }
    const record = FrontlineOutcomeRecordSchema.parse(reading.record);
    const admission = frontline.admission;
    if (!frontlineOutcomeMatchesState(record, state, originalOutcome)
      || !frontlineAttemptMatchesState(attempt, state, record)
      || !frontlineAdmissionMatches(attempt, state, record)
      || (record.outcome.outcome !== "clean" && record.outcome.outcome !== "findings")) {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer admission mismatch");
    }
    return {
      kind: "frontline",
      producerId: state.operationId,
      repositoryId: state.repositoryId,
      target: record.outcome.target,
      sourceIdentity: record.sourceIdentity,
      originalOutcome: record.outcome.outcome,
      findings: record.outcome.findings,
      resultDigest: record.outcomeDigest,
      admission: {
        lineage: admission.lineage,
        logicalPass: admission.logicalPass,
        retryGeneration: admission.retryGeneration,
        requestedCoverage: admission.requestedCoverage,
        effectiveCoverage: frontline.effectiveCoverage,
        scopeMode: "whole-target",
        policyVersion: admission.policyVersion,
      },
      outcomeRef: reading.outcomeRef,
      sourceBindingId: state.sourceBindingId,
      executableIdentity: record.executableIdentity,
      outcome: record.outcome,
      ...(state.responseBinding === undefined ? {} : { responseBinding: state.responseBinding }),
    };
  }

  private readHostedResult(
    producer: ReviewOperationStateSnapshotRecord,
    attempt: LaneAttempt,
  ): ReviewResult {
    const state = producer.state;
    const hosted = attempt.hosted;
    const sealed = hosted?.sealedResult;
    const originalOutcome = immutableProducerOutcome(attempt);
    if (state.kind !== "lane-progress"
      || !hostedProducerMatchesOwner(state, attempt)
      || !hostedProducerMatchesAdmission(attempt)
      || hosted === undefined || sealed === undefined
      || (originalOutcome !== "clean" && originalOutcome !== "findings")) {
      throw new LocalReviewResultReaderError("corrupt-result", "hosted producer admission mismatch");
    }
    const findings = sealed.findings.map(projectHostedFinding);
    return {
      kind: "hosted",
      producerId: attempt.attemptId,
      repositoryId: state.repositoryId,
      target: hosted.reviewTarget,
      sourceIdentity: attempt.sourceId,
      originalOutcome,
      findings,
      resultDigest: sealed.hostedResultId,
      admission: {
        lineage: hosted.admission.lineage,
        logicalPass: hosted.admission.logicalPass,
        retryGeneration: attempt.retryGeneration,
        requestedCoverage: hosted.requestedCoverage,
        // The handle records carrier invocation; the lane value is the evidence-bearing coverage authority.
        effectiveCoverage: hosted.effectiveCoverage,
        scopeMode: "whole-target",
        policyVersion: hosted.requirement.policyVersion,
        ...(hosted.admission.correctionScope === undefined
          || (hosted.admission.sourceId === "coderabbit-pr"
            && sealed.coverageEvidence?.status !== "established")
          ? {}
          : { correctionScope: hosted.admission.correctionScope }),
      },
      laneOperationId: state.operationId,
      actorIdentity: hosted.actorIdentity,
      hostedTarget: hosted.target,
      requirement: hosted.requirement,
      ...(sealed.coverageEvidence === undefined
        ? {}
        : { coverageEvidence: sealed.coverageEvidence }),
      ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
      hostSettlementFindingIds: sealed.findings
        .filter(({ settlement }) => settlement === "reply-and-resolve")
        .map(({ findingId }) => findingId),
      noHostSettlementFindingIds: sealed.findings
        .filter(({ settlement }) => settlement === "not-applicable")
        .map(({ findingId }) => findingId),
      settled: attempt.outcome === "settled-findings",
    };
  }
}
