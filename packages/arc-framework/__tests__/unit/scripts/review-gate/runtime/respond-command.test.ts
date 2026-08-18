import { describe, expect, it, vi } from "vitest";

import { canonicalDigest, canonicalize } from "../../../../../src/lib/kernel/index.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  createFrontlineOutcomeRecord,
  type ApprovedDispositionRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import {
  respondToReviewCommand,
  type RespondCommandDependencies,
} from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;
const memberVehicle = { kind: "delivery-member", identity: DELIVERABLE_ID } as const;
const workUnitVehicle = { kind: "work-unit", identity: "review-surface-binding" } as const;
const errandVehicle = { kind: "errand", identity: "repair-review-state" } as const;

function fixture(vehicle: LocalReviewState["vehicle"] = workUnitVehicle) {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle.kind === "delivery-member" ? "delivery-member" : "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected requirement");
  const authority = {
    vehicle,
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    attestationRuntimeKind: "arc-cli",
    runtimeIdentity: "arc-cli/0.1.0",
    attestationMechanism: "local-attestation" as const,
  };
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority,
    laneSourceId: "delegated-agent",
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  const source = createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    objectFormat: "sha1",
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: target.headSha,
    headTree: target.headTree,
    reachabilityRef: `refs/arc/review/local/${admission.operationId}`,
    materializationRef: `/tmp/${admission.operationId}`,
  });
  const operation: LocalReviewState = {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId: admission.operationId,
    updatedAt: "2026-07-23T17:00:00Z",
    vehicle: authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    laneSourceId: admission.laneSourceId,
    attestationRuntimeKind: authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: source.sourceDigest,
    guidanceDigest: digest("guidance"),
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 60_000,
  };
  const finding = {
    findingId: "finding-1",
    severity: "major" as const,
    locus: "src/index.ts:7",
    evidenceUrlOrId: "review:finding-1",
  };
  const receipt = createLocalReviewReceipt({
    target,
    requirement,
    carrier: admission.carrier,
    result: {
      status: "complete",
      result: "findings",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      headSha: target.headSha,
      headTree: target.headTree,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      sourceDigest: source.sourceDigest,
      guidanceDigest: operation.guidanceDigest,
      evaluatorIdentity: authority.evaluatorIdentity,
      reviewRunId: "run-1",
      applicabilityId: null,
      findings: [finding],
    },
    runtimeIdentity: authority.runtimeIdentity,
    attestationMechanism: authority.attestationMechanism,
    sourceDigest: source.sourceDigest,
    guidanceDigest: operation.guidanceDigest,
  });
  const receiptRef = bindReviewSourceReference({
    kind: "attested-local",
    operationId: operation.operationId,
    durableRef: "git-common:review-gate/evidence/receipts-v2.json#1",
  });
  return { target, authority, operation, source, receipt, receiptRef, finding };
}

function approved(input: {
  targetId: string;
  policyVersion: string;
  rubricVersion: string;
  rubricDigest: string;
  sourceIdentity: string;
  finding: ReturnType<typeof fixture>["finding"];
  disposition?: "fix" | "defer" | "reject";
  proposedBy?: string;
  approvedBy?: string;
}) {
  const disposition = input.disposition ?? "fix";
  return approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: input.targetId,
      policyVersion: input.policyVersion,
      rubricVersion: input.rubricVersion,
      rubricDigest: input.rubricDigest,
      proposedBy: input.proposedBy ?? "arc-cli/0.1.0",
      findings: [{
        findingId: input.finding.findingId,
        sourceIdentity: input.sourceIdentity,
        locus: input.finding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        severity: input.finding.severity,
        disposition,
        gating: "blocking",
        rationale: "The selected source supports this disposition.",
        recommendation: disposition === "fix" ? "Apply the fix." : "Record the disposition.",
        openQuestions: [],
      }],
    })),
    approvedBy: input.approvedBy ?? "author-1",
    approvedAt: "2026-07-23T20:00:00Z",
  });
}

function dependencies(records: ReturnType<typeof fixture>) {
  let disposition: ApprovedDispositionRecord | null = null;
  const deps: RespondCommandDependencies = {
    operationStore: {
      readOperation: async () => ({ version: 1, state: records.operation }),
      publishOperation: vi.fn(),
    },
    sourceStore: {
      readSource: async () => records.source,
      appendSource: vi.fn(),
    },
    outcomeStore: {
      readOutcome: vi.fn(),
      appendOutcome: vi.fn(),
    },
    dispositionStore: {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord: async (record) => {
        if (disposition !== null && canonicalize(disposition) !== canonicalize(record)) {
          throw new Error("conflict");
        }
        disposition = record;
        return { dispositionRecordRef: "git-common:review-gate/evidence/disposition.json" };
      },
    },
    readReceipt: async () => records.receipt,
    confirmTarget: async (target) => ({ state: "current", target }),
    resolveLocalActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
    resolveFrontlineActors: async () => ({
      approverIdentity: records.authority.authorIdentity,
      proposerIdentity: records.authority.runtimeIdentity,
    }),
    readCandidateLineage: async () => null,
    appendCandidateResponse: () => Promise.reject(new Error("unexpected Candidate append")),
    settleLaneFindings: async () => undefined,
  };
  return deps;
}

const CANDIDATE_RECORD_PATH = ".arc/system/.internal/candidates/example.json";

function candidateSubject(source: string) {
  return createCandidateSubjectSnapshot([
    { path: "src/index.ts", mode: "100644", digest: canonicalDigest({ source }), treatment: "reviewable" },
  ]);
}

function candidateRecord(): CandidateManagedRecordV1 {
  const rootSubject = candidateSubject("root");
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject: rootSubject,
      baseRevision: objectId("a"),
      attestedBy: "author-1",
      attestedAt: "2026-08-15T14:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    }),
    subject: rootSubject,
    responses: [],
    lineageAttestations: [],
  };
}

/** Bind respond to a Candidate lineage and the head movement a landed fix produces. */
function lineageDependencies(
  records: ReturnType<typeof fixture>,
  current: { revision: string; subject: ReturnType<typeof candidateSubject> },
) {
  const record = candidateRecord();
  const recordVersion = canonicalDigest(record);
  const appends: Array<{
    workUnit: string;
    record: CandidateManagedRecordV1;
    expectedRecordVersion: string;
  }> = [];
  const deps: RespondCommandDependencies = {
    ...dependencies(records),
    confirmTarget: async (target) => ({
      state: "stale-target",
      attemptedTarget: target,
      currentTarget: createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: target.repositoryId,
        baseRef: "main",
        diffBaseSha: objectId("a"),
        diffBaseTree: objectId("b"),
        headSha: objectId("e"),
        headTree: objectId("f"),
      }),
    }),
    readCandidateLineage: async () => ({
      workUnit: "example",
      record,
      recordVersion,
      current,
      unstagedReviewablePaths: [],
    }),
    appendCandidateResponse: async (input) => {
      appends.push(input);
      return { recordPath: CANDIDATE_RECORD_PATH };
    },
  };
  return { deps, record, appends };
}

function verifiedFixRequest(records: ReturnType<typeof fixture>, disposition: "fix" | "defer" = "fix") {
  return {
    ...localRequest(records, disposition),
    verifiedFix: {
      applicability: "focused" as const,
      verificationEvidenceRefs: ["verification://focused-fix"],
    },
  };
}

function localRequest(
  records: ReturnType<typeof fixture>,
  disposition: "fix" | "defer" | "reject" = "fix",
) {
  return {
    schemaVersion: 1,
    source: { kind: "attested-local", receiptRef: records.receiptRef },
    dispositions: approved({
      targetId: records.target.targetId,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      sourceIdentity: records.authority.evaluatorIdentity,
      finding: records.finding,
      disposition,
    }),
  };
}

/** The same approved set, approved by an identity that is not the active local one. */
function foreignApproval(records: ReturnType<typeof fixture>) {
  return approved({
    targetId: records.target.targetId,
    policyVersion: records.operation.policyVersion,
    rubricVersion: records.operation.requirement.rubricVersion,
    rubricDigest: records.operation.requirement.rubricDigest,
    sourceIdentity: records.authority.evaluatorIdentity,
    finding: records.finding,
    approvedBy: "a-different-author",
  });
}

describe("review response command", () => {
  it("constructs a source-bound proposal from author-owned finding decisions", async () => {
    const records = fixture();
    const earlierFinding = {
      findingId: "finding-0",
      severity: "major" as const,
      locus: "src/earlier.ts:3",
      evidenceUrlOrId: "review:finding-0",
    };
    records.receipt.findings.push(earlierFinding);

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: records.receiptRef },
      proposal: {
        findings: [{
          findingId: records.finding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/index.ts:7"],
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }, {
          findingId: earlierFinding.findingId,
          sourceVerification: "verified",
          verificationRefs: ["source:src/earlier.ts:3"],
          disposition: "fix",
          rationale: "The selected source supports this disposition.",
          recommendation: "Apply the fix.",
          openQuestions: [],
        }],
      },
    }, dependencies(records))).resolves.toMatchObject({
      state: "awaiting-approval",
      nextAction: "obtain-approval",
      payload: {
        operationId: records.operation.operationId,
        proposal: {
          state: "proposed",
          dispositionSet: {
            targetId: records.target.targetId,
            policyVersion: records.operation.policyVersion,
            rubricVersion: records.operation.requirement.rubricVersion,
            rubricDigest: records.operation.requirement.rubricDigest,
            proposedBy: records.authority.runtimeIdentity,
            findings: [{
              findingId: earlierFinding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: earlierFinding.locus,
              severity: earlierFinding.severity,
              gating: "blocking",
            }, {
              findingId: records.finding.findingId,
              sourceIdentity: records.authority.evaluatorIdentity,
              locus: records.finding.locus,
              severity: records.finding.severity,
              gating: "blocking",
            }],
            dispositionSetId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          },
        },
      },
    });
  });

  it("collapses matching grades and labels both grades only when ARC re-grades", async () => {
    const records = fixture();
    const proposal = async (sourceVerification: "verified" | "not-supported", severity: "blocker") =>
      respondToReviewCommand({
        schemaVersion: 1,
        source: { kind: "attested-local", receiptRef: records.receiptRef },
        proposal: {
          findings: [{
            findingId: records.finding.findingId,
            sourceVerification,
            verificationRefs: ["source:src/index.ts:7"],
            severity,
            disposition: sourceVerification === "verified" ? "fix" : "reject",
            rationale: "The selected source determines this disposition.",
            recommendation: sourceVerification === "verified" ? "Apply the fix." : "Reject the finding.",
            openQuestions: [],
          }],
        },
      }, dependencies(records));

    const regraded = await proposal("verified", "blocker");
    if (regraded.state !== "awaiting-approval") throw new Error("regraded proposal was not materialized");
    const regradedFinding = regraded.payload.proposal.dispositionSet.findings[0];
    expect(regradedFinding).toMatchObject({ reviewerSeverity: "major", arcSeverity: "blocker" });
    expect(regradedFinding).not.toHaveProperty("severity");

    const unsupported = await proposal("not-supported", "blocker");
    if (unsupported.state !== "awaiting-approval") throw new Error("unsupported proposal was not materialized");
    const unsupportedFinding = unsupported.payload.proposal.dispositionSet.findings[0];
    expect(unsupportedFinding).toMatchObject({
      sourceVerification: "not-supported",
      reviewerSeverity: "major",
      disposition: "reject",
    });
    expect(unsupportedFinding).not.toHaveProperty("severity");
    expect(unsupportedFinding).not.toHaveProperty("arcSeverity");
  });

  it("reloads local receipt and source authority and returns a validated fix authorization", async () => {
    const records = fixture();
    await expect(respondToReviewCommand(localRequest(records), dependencies(records))).resolves.toMatchObject({
      state: "ready-to-fix",
      nextAction: "apply-fix",
      payload: {
        operationId: records.operation.operationId,
        dispositionRecordRef: "git-common:review-gate/evidence/disposition.json",
        fixAuthorization: {
          oldTargetId: records.target.targetId,
          authorizedFindingIds: ["finding-1"],
        },
        reentryCommand: "local-prepare",
      },
    });
  });

  it("returns settled and then already-settled for an identical non-fix replay", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const request = localRequest(records, "defer");
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "settled" });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "already-settled" });
  });

  it("returns stale-target before appending dispositions when the reviewed target moved", async () => {
    const records = fixture();
    const deps = dependencies(records);
    const appendDispositionRecord = vi.fn();
    const currentTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    deps.confirmTarget = async () => ({
      state: "stale-target",
      attemptedTarget: records.target,
      currentTarget,
    });
    deps.dispositionStore.appendDispositionRecord = appendDispositionRecord;

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: records.operation.operationId,
        attemptedTarget: records.target,
        currentTarget,
      },
    });
    expect(appendDispositionRecord).not.toHaveBeenCalled();
  });

  it("refuses actor identities that do not come from the trusted boundary", async () => {
    const records = fixture();
    const request = localRequest(records);
    request.dispositions = approved({
      targetId: records.target.targetId,
      policyVersion: records.operation.policyVersion,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
      sourceIdentity: records.authority.evaluatorIdentity,
      finding: records.finding,
      proposedBy: "other-runtime",
    });
    await expect(respondToReviewCommand(request, dependencies(records)))
      .rejects.toThrow("composing runtime");
  });

  it("refuses a divergent replay for the same operation", async () => {
    const records = fixture();
    const deps = dependencies(records);
    await respondToReviewCommand(localRequest(records, "defer"), deps);
    await expect(respondToReviewCommand(localRequest(records, "reject"), deps))
      .rejects.toThrow("conflicting approved disposition record");
  });

  it("loads frontline findings from the exact durable outcome and rejects non-findings", async () => {
    const records = fixture();
    const source = {
      sourceId: "coderabbit-cli",
      kind: "command" as const,
      executable: "coderabbit",
      argv: ["review"],
    };
    const findingsOutcome = normalizeFrontlineOutcome({
      providerResult: { kind: "findings", findings: [records.finding] },
      source,
      target: records.target,
      pass: 1,
      maxPasses: 2,
    });
    const record = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: records.target.repositoryId,
      operationId: "frontline-operation",
      sourceIdentity: source.sourceId,
      executableIdentity: {
        digest: digest("coderabbit"),
        qualifiedVersion: "coderabbit/1.0.0",
      },
      outcome: findingsOutcome,
    });
    const durableRef = "git-common:review-gate/outcomes/frontline.json#1";
    const outcomeRef = bindReviewSourceReference({
      kind: "frontline",
      operationId: record.operationId,
      durableRef,
    });
    const deps = dependencies(records);
    deps.outcomeStore.readOutcome = async () => ({ version: 1, record, outcomeRef: durableRef });
    const dispositions = approved({
      targetId: records.target.targetId,
      policyVersion: digest("frontline-policy"),
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("frontline-rubric"),
      sourceIdentity: source.sourceId,
      finding: records.finding,
    });

    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      dispositions,
    }, deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: {
        operationId: record.operationId,
        reentryCommand: "frontline-resolve",
        frontlineFollowUp: {
          action: "follow-up-after-fix",
          pass: 2,
          maxPasses: 2,
          nextCommand: "frontline-resolve",
        },
      },
    });

    const clean = createFrontlineOutcomeRecord({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: record.repositoryId,
      operationId: record.operationId,
      sourceIdentity: record.sourceIdentity,
      executableIdentity: record.executableIdentity,
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" },
        source,
        target: records.target,
        pass: 1,
        maxPasses: 2,
      }),
    });
    deps.outcomeStore.readOutcome = async () => ({ version: 1, record: clean, outcomeRef: durableRef });
    await expect(respondToReviewCommand({
      schemaVersion: 1,
      source: { kind: "frontline", outcomeRef },
      dispositions,
    }, deps)).rejects.toThrow("requires a findings outcome");
  });

  it.each([
    ["delivery member", memberVehicle],
    ["work unit", workUnitVehicle],
    ["Errand", errandVehicle],
  ] as const)("resolves actors for a %s operation from the evaluator identity alone", async (
    _label,
    vehicle,
  ) => {
    const records = fixture(vehicle);
    const deps = dependencies(records);
    const resolveLocalActors = vi.fn(deps.resolveLocalActors);
    deps.resolveLocalActors = resolveLocalActors;

    await expect(respondToReviewCommand(localRequest(records), deps)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: { operationId: records.operation.operationId },
    });
    // The vehicle never reaches actor resolution, so no member selector exists to
    // carry: approver and proposer are identical across all three operations.
    expect(resolveLocalActors).toHaveBeenCalledWith(records.authority.evaluatorIdentity);
  });
});

describe("verified-fix Candidate settlement", () => {
  it("appends the approved response and its delta evidence to the Candidate record", async () => {
    const records = fixture();
    const { deps, record, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    const request = verifiedFixRequest(records);

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: {
        operationId: records.operation.operationId,
        candidateId: record.attestation.candidateId,
        recordPath: CANDIDATE_RECORD_PATH,
        implementationChanged: true,
      },
    });

    expect(appends).toHaveLength(1);
    const [response] = appends[0]?.record.responses ?? [];
    expect(response).toMatchObject({
      candidateId: record.attestation.candidateId,
      dispositionId: request.dispositions.dispositionSet.dispositionSetId,
      approvedBy: records.authority.authorIdentity,
      appliedBy: records.authority.runtimeIdentity,
      applicability: "focused",
      verificationEvidenceRefs: ["verification://focused-fix"],
      implementationChanged: true,
      oldTarget: { revision: record.attestation.baseRevision },
      newTarget: { revision: objectId("e") },
    });
  });

  it("leaves the advanced lineage awaiting one converged full attestation", async () => {
    const records = fixture();
    const current = { revision: objectId("e"), subject: candidateSubject("fixed") };
    const { deps, appends } = lineageDependencies(records, current);

    await respondToReviewCommand(verifiedFixRequest(records), deps);

    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an appended Candidate record");
    expect(projectCandidateCurrentness({ record: advanced, current })).toMatchObject({
      status: "current",
      implementationChanged: true,
      convergenceVerification: "pending",
    });
  });

  it("records operational-only approved evidence when the lineage subject is unchanged", async () => {
    const records = fixture();
    const { deps, record, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("root"),
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps)).resolves.toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: {
        candidateId: record.attestation.candidateId,
        implementationChanged: false,
      },
    });
    expect(appends).toHaveLength(1);
    expect(appends[0]).toMatchObject({
      workUnit: "example",
      expectedRecordVersion: canonicalDigest(record),
      record: {
        subject: record.subject,
        responses: [expect.objectContaining({ implementationChanged: false })],
      },
    });
  });

  it("returns the current Candidate when an identical verified response is replayed", async () => {
    const records = fixture();
    const current = {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    };
    const { deps, appends } = lineageDependencies(records, current);
    const request = verifiedFixRequest(records);

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-advanced",
    });
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("expected an appended Candidate record");
    deps.readCandidateLineage = async () => ({
      workUnit: "example",
      record: advanced,
      recordVersion: canonicalDigest(advanced),
      current,
      unstagedReviewablePaths: [],
    });

    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({
      state: "candidate-current",
      nextAction: "continue-review",
      payload: { candidateId: advanced.attestation.candidateId },
    });
    expect(appends).toHaveLength(1);
  });

  it("refuses a verified fix whose exact target never changed", async () => {
    const records = fixture();

    await expect(respondToReviewCommand(
      verifiedFixRequest(records),
      dependencies(records),
    )).rejects.toThrow("requires a changed exact target");
  });

  it("refuses a verified fix with no Candidate lineage to advance", async () => {
    const records = fixture();
    const { deps } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    deps.readCandidateLineage = async () => null;

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("managed Candidate record");
  });

  it("refuses a verified fix the index does not carry, rather than advancing a lineage without it", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });
    const lineage = await deps.readCandidateLineage();
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    deps.readCandidateLineage = async () => ({
      ...lineage,
      unstagedReviewablePaths: ["packages/arc-framework/src/fixed.ts"],
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("packages/arc-framework/src/fixed.ts");
    expect(appends).toHaveLength(0);
  });

  it("refuses an unstaged fix the recorded subject already matches, rather than reporting it current", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("root"),
    });
    const lineage = await deps.readCandidateLineage();
    if (lineage === null) throw new Error("expected a bound Candidate lineage");
    deps.readCandidateLineage = async () => ({
      ...lineage,
      unstagedReviewablePaths: ["packages/arc-framework/src/fixed.ts"],
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records), deps))
      .rejects.toThrow("must be staged");
    expect(appends).toHaveLength(0);
  });

  it("refuses a verified fix over dispositions that authorized no fix", async () => {
    const records = fixture();
    const { deps, appends } = lineageDependencies(records, {
      revision: objectId("e"),
      subject: candidateSubject("fixed"),
    });

    await expect(respondToReviewCommand(verifiedFixRequest(records, "defer"), deps))
      .rejects.toThrow("unsupported state 'ready-to-close'");
    expect(appends).toHaveLength(0);
  });
});

/** The head an approved set's landed fixes settled at, which is what the replay pins. */
function settledHead(repositoryId: string, headSha: string, headTree: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId,
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha,
    headTree,
  });
}

/** Bind respond to a checkout whose current target the test moves between passes. */
function movingCheckout(records: ReturnType<typeof fixture>) {
  const deps = dependencies(records);
  let current: ReturnType<typeof settledHead> | null = null;
  return {
    deps: {
      ...deps,
      confirmTarget: async (target: typeof records.target) => (current === null
        ? { state: "current" as const, target }
        : { state: "stale-target" as const, attemptedTarget: target, currentTarget: current }),
    },
    moveTo: (target: ReturnType<typeof settledHead> | null) => {
      current = target;
    },
  };
}

describe("approved-settlement replay", () => {
  it("settles an approved set at the head its fixes landed at", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));

    await expect(respondToReviewCommand(localRequest(records), deps))
      .resolves.toMatchObject({ state: "ready-to-fix" });
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({
        state: "already-settled",
        nextAction: "reduce",
        payload: { operationId: records.operation.operationId },
      });
  });

  it("repeats without deciding anything a second time", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledFixTarget);

    const replay = { ...localRequest(records), settledFixTarget };
    const first = await respondToReviewCommand(replay, deps);
    await expect(respondToReviewCommand(replay, deps)).resolves.toEqual(first);
  });

  it("refuses when the checkout no longer carries the settled head", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await respondToReviewCommand(localRequest(records), deps);
    moveTo(settledHead(records.target.repositoryId, objectId("9"), objectId("8")));

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({
        state: "stale-target",
        nextAction: "prepare-current-target",
        payload: { attemptedTarget: { targetId: settledFixTarget.targetId } },
      });
  });

  it("refuses a replay no durable approved record backs, under its own typed state", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .resolves.toMatchObject({ state: "missing-record", nextAction: "respond-again" });
  });

  it("returns a replay's actor mismatch as typed state rather than throwing", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({
      ...localRequest(records),
      dispositions: foreignApproval(records),
      settledFixTarget,
    }, deps)).resolves.toMatchObject({
      state: "actor-mismatch",
      nextAction: "respond-again",
      payload: { actor: "approver" },
    });
  });

  it("still throws the same mismatch on the attended response path", async () => {
    // Only the unattended replay needs typed state; an attended caller reads the exception.
    const records = fixture();
    const { deps } = movingCheckout(records);

    await expect(respondToReviewCommand({
      ...localRequest(records),
      dispositions: foreignApproval(records),
    }, deps)).rejects.toThrow("approver is not the active local identity");
  });

  it("refuses a replay whose dispositions disagree with the durable record", async () => {
    const records = fixture();
    const { deps, moveTo } = movingCheckout(records);
    const settledFixTarget = settledHead(records.target.repositoryId, objectId("e"), objectId("f"));
    await expect(respondToReviewCommand(localRequest(records, "defer"), deps))
      .resolves.toMatchObject({ state: "settled" });
    moveTo(settledFixTarget);

    await expect(respondToReviewCommand({ ...localRequest(records), settledFixTarget }, deps))
      .rejects.toThrow("conflicting approved disposition record");
  });

  it("refuses a replay that also submits a verified fix", async () => {
    const records = fixture();
    const { deps } = movingCheckout(records);

    await expect(respondToReviewCommand({
      ...verifiedFixRequest(records),
      settledFixTarget: settledHead(records.target.repositoryId, objectId("e"), objectId("f")),
    }, deps)).rejects.toThrow();
  });
});
