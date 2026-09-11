import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliveryThreeMemberStackPlanFixture } from "../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../fixtures/delivery-state.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../src/lib/work-unit/candidate-attestation.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../src/lib/delivery/review-vehicle.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const mocks = vi.hoisted(() => ({
  collectGitCandidateTarget: vi.fn(),
  composeDeliveryCheckpointArm: vi.fn(),
  createHostedReservationDischargeReader: vi.fn(),
  projectEffectiveCandidateCurrentness: vi.fn(),
  projectGitCandidateEffectiveTarget: vi.fn(),
  persistIntegrationCheckpointComposition: vi.fn(),
  resolveIdentity: vi.fn(),
  createUserSurfaceResolver: vi.fn(),
  resolveGitCandidateTargetBase: vi.fn(),
  readCandidateRecordVersion: vi.fn(),
  readCandidateRecordVersioned: vi.fn(),
  readConfigSettings: vi.fn(),
  readLaneProgress: vi.fn(),
  readOperationSnapshot: vi.fn(),
  readRequest: vi.fn(),
  readSubmissionBoundary: vi.fn(),
  resolveDischargeTargets: vi.fn(),
  resolveRepositoryIdentity: vi.fn(),
  resolveChangeRequest: vi.fn(),
  resolveTerminalRecords: vi.fn(),
  projectCandidateCurrentness: vi.fn(),
}));

vi.mock("../../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: mocks.readConfigSettings,
}));
vi.mock("../../../../src/lib/git/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/git/index.js")>(),
  resolveIdentity: mocks.resolveIdentity,
}));
vi.mock("../../../../src/lib/user-surfaces.js", () => ({
  createUserSurfaceResolver: mocks.createUserSurfaceResolver,
}));
vi.mock("../../../../src/lib/work-unit/candidate-attestation.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/candidate-attestation.js")>(),
  projectCandidateCurrentness: mocks.projectCandidateCurrentness,
}));
vi.mock("../../../../src/lib/work-unit/candidate-effective-target.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/candidate-effective-target.js")>(),
  projectEffectiveCandidateCurrentness: mocks.projectEffectiveCandidateCurrentness,
}));
vi.mock("../../../../src/lib/work-unit/candidate-record-store.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/candidate-record-store.js")>(),
  readCandidateRecordVersion: mocks.readCandidateRecordVersion,
  readCandidateRecordVersioned: mocks.readCandidateRecordVersioned,
}));
vi.mock("../../../../src/lib/work-unit/git-candidate-subject.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/git-candidate-subject.js")>(),
  collectGitCandidateTarget: mocks.collectGitCandidateTarget,
}));
vi.mock("../../../../src/lib/work-unit/git-candidate-effective-target.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/git-candidate-effective-target.js")>(),
  projectGitCandidateEffectiveTarget: mocks.projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase: mocks.resolveGitCandidateTargetBase,
}));
vi.mock("../../../../src/lib/work-unit/submission-boundary-store.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/submission-boundary-store.js")>(),
  readSubmissionBoundary: mocks.readSubmissionBoundary,
}));
vi.mock("../../../../src/scripts/delivery/hosts/github.js", () => ({
  GhDeliveryHostPort: class {
    readonly readRequest = mocks.readRequest;
  },
}));
vi.mock("../../../../src/scripts/review-gate/change-request.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/scripts/review-gate/change-request.js")>(),
  resolveChangeRequest: mocks.resolveChangeRequest,
}));
vi.mock("../../../../src/scripts/review-gate/hosts/github/change-request.js", () => ({
  createGhChangeRequestResolutionPort: vi.fn(() => ({})),
}));
vi.mock("../../../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js", () => ({
  RepositoryDeliveryMemberLookup: class {
    readonly resolveTerminalRecords = mocks.resolveTerminalRecords;
    readonly resolveDischargeTargets = mocks.resolveDischargeTargets;
  },
}));
vi.mock("../../../../src/scripts/review-gate/hosts/local/git-common-state.js", () => ({
  resolveRepositoryIdentity: mocks.resolveRepositoryIdentity,
}));
vi.mock("../../../../src/scripts/review-gate/hosts/local/operation-state-store.js", () => ({
  LocalReviewOperationStateStore: class {
    readonly readOperationSnapshot = mocks.readOperationSnapshot;
  },
}));
vi.mock("../../../../src/scripts/review-gate/lane-progress.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/scripts/review-gate/lane-progress.js")>(),
  readLaneProgress: mocks.readLaneProgress,
}));
vi.mock("../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js")
  >();
  mocks.createHostedReservationDischargeReader.mockImplementation(
    actual.createHostedReservationDischargeReader,
  );
  return {
    ...actual,
    createHostedReservationDischargeReader: mocks.createHostedReservationDischargeReader,
  };
});
vi.mock("../../../../src/scripts/integration/delivery-checkpoint.js", () => ({
  composeDeliveryCheckpointArm: mocks.composeDeliveryCheckpointArm,
}));
vi.mock("../../../../src/scripts/integration/checkpoint-store.js", () => ({
  persistIntegrationCheckpointComposition: mocks.persistIntegrationCheckpointComposition,
}));

import {
  createIntegrationCheckpointDependencies,
  deliveryCheckpointReviewIsDischarged,
} from
  "../../../../src/scripts/integration/checkpoint-composition.js";
import { composeCanonicalSettlementPlan } from
  "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);

function candidateRecord(workUnit: string, revision: string): CandidateManagedRecordV1 {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/terminal.ts",
    mode: "100644",
    digest: canonicalDigest({ revision }),
    treatment: "reviewable",
  }]);
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit,
      subject,
      baseRevision: revision,
      attestedBy: "andrew",
      attestedAt: "2026-09-10T16:00:00.000Z",
      verificationEvidenceRef: "tasks-example.md#verification",
    }),
    subject,
    transitions: [],
    lineageAttestations: [],
  };
}

describe("delivery checkpoint composition", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createHostedReservationDischargeReader.mockReturnValue(async () => ({
      discharged: true,
      detail: "The exact delivery review is discharged.",
    }));
    mocks.resolveIdentity.mockResolvedValue("andrew");
    mocks.createUserSurfaceResolver.mockReturnValue({
      workUnitRoot: () => "/repository/.arc/user/andrew/example",
    });
    mocks.persistIntegrationCheckpointComposition.mockResolvedValue(
      `checkpoint-v1:${oid("c")}:sha256:${"d".repeat(64)}`,
    );
  });

  it("honors an exact Owner terminus when the raw member discharge remains outstanding", () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({
      kind: "delivery-member",
      planId: "123e4567-e89b-42d3-a456-426614174000",
      deliverableId: `sha256:${"a".repeat(64)}`,
      workUnitId: "delivery-native-stack-composition",
      head: oid("b"),
    });

    expect(deliveryCheckpointReviewIsDischarged({
      targets: [{ vehicle }],
      discharges: [{
        discharged: false,
        detail: "The reserved source has no clean attempt.",
        nextSource: "coderabbit-pr",
      }],
      progress: [{ status: "complete", completedPasses: 2, attempts: [], attemptHistory: [] }],
      ownerTermini: [{
        vehicle,
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "andrew",
          completedPasses: 2,
        },
      }],
    })).toBe(true);
  });

  it("classifies disjoint delivery drift before effective currentness and path intersections", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const candidateId = `sha256:${"a".repeat(64)}`;
    const subjectDigest = `sha256:${"b".repeat(64)}`;
    const candidateHead = oid("c");
    const currentness = {
      status: "current" as const,
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
    };
    const effective = {
      state: "current" as const,
      candidateId,
      recognizedTarget: { revision: candidateHead, subject: { subjectDigest } },
    };
    const rawExec = vi.fn(async (args: string[]) => {
      void args;
      return { stdout: new Uint8Array() };
    });

    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: candidateRecord(plan.workUnitId, candidateHead),
      version: `sha256:${"e".repeat(64)}`,
    });
    mocks.collectGitCandidateTarget.mockResolvedValue({ subject: { subjectDigest } });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });

    const mergeBase = oid("a");
    const exec = vi.fn(async (_command: string, args: readonly string[]) => {
      if (args[0] === "merge-base") return { stdout: `${mergeBase}\n`, stderr: "" };
      if (args[0] === "diff") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec,
      rawExec,
    });
    const result = await dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: oid("d"),
      headOid: oid("c"),
      movement: "disjoint",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    });

    expect(result).toEqual({
      status: "disjoint",
      nextAction: "continue",
      evidence: {
        baselineRevision: candidateHead,
        baseRevision: oid("d"),
        mergeBase,
        substantivePaths: [],
        regenerablePaths: [],
      },
    });
    expect(rawExec).not.toHaveBeenCalled();
    expect(mocks.projectGitCandidateEffectiveTarget).not.toHaveBeenCalled();

    await dependencies.readCandidate(plan.workUnitId, oid("d"));
    expect(mocks.readCandidateRecordVersioned).toHaveBeenCalledTimes(1);
    expect(mocks.projectGitCandidateEffectiveTarget).toHaveBeenCalledTimes(1);
  });

  it("refuses interacting predecessor movement from the durable Candidate baseline", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baselineRevision = state.members.at(-1)!.coordinates!.head;
    const baseRevision = oid("d");
    const mergeBase = oid("a");
    const highestCoordinate = state.members.at(-2)!.coordinates!;
    const firstCoordinate = state.members[0]!.coordinates!;
    const sharedPath = "src/shared.ts";
    const candidateId = candidateRecord(plan.workUnitId, baselineRevision).attestation.candidateId;
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: candidateRecord(plan.workUnitId, baselineRevision),
      version: `sha256:${"e".repeat(64)}`,
    });
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue({
      state: "current",
      candidateId,
      recognizedTarget: {
        revision: baselineRevision,
        subject: { subjectDigest: `sha256:${"b".repeat(64)}` },
      },
    });
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue({
      status: "current",
      candidateId,
      recognizedRevision: baselineRevision,
      implementationChanged: false,
      convergenceVerification: "satisfied",
    });
    const exec = vi.fn(async (_command: string, args: readonly string[]) => {
      if (args[0] === "merge-base") return { stdout: `${mergeBase}\n`, stderr: "" };
      if (args[0] === "diff") return { stdout: `${sharedPath}\0`, stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });
    const rawExec = vi.fn(async (args: string[]) => ({
      stdout: new TextEncoder().encode(
        args[4] === firstCoordinate.base && args[5] === highestCoordinate.head
          ? `${sharedPath}\0`
          : "",
      ),
    }));
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec,
      rawExec,
    });

    await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: baseRevision,
      headOid: oid("c"),
      movement: "overlapping",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [sharedPath], regenerablePaths: [] },
      register: null,
    })).resolves.toEqual({
      status: "refused",
      reason: "predecessor-overlap",
      paths: [sharedPath],
      explanation: "Protected-base movement overlaps the retained delivery predecessor contribution.",
      evidence: {
        baselineRevision,
        baseRevision,
        mergeBase,
        substantivePaths: [sharedPath],
        regenerablePaths: [],
        residualPaths: [],
        predecessorPaths: [sharedPath],
      },
    });
    expect(mocks.projectGitCandidateEffectiveTarget).not.toHaveBeenCalled();
  });

  it("sanitizes a malformed managed Candidate record failure", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.readCandidateRecordVersioned.mockRejectedValue(
      new Error("Candidate record is malformed: /home/private/record.json"),
    );
    const dependencies = createIntegrationCheckpointDependencies({ cwd: "/repository", exec: vi.fn() });

    await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: baseRevision,
      headOid: oid("c"),
      movement: "overlapping",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    })).resolves.toEqual({
      status: "unavailable",
      detail: "The managed delivery Candidate record could not be read or validated.",
      evidence: { baseRevision },
      nextAction: { command: "rerun-checkpoint", workUnit: plan.workUnitId },
    });
  });

  it("retains exact coordinates when the delivery overlap revisions cannot resolve", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baselineRevision = state.members.at(-1)!.coordinates!.head;
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: candidateRecord(plan.workUnitId, baselineRevision),
      version: `sha256:${"e".repeat(64)}`,
    });
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec: vi.fn(async () => { throw new Error("missing object"); }),
    });

    await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: baseRevision,
      headOid: oid("c"),
      movement: "overlapping",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    })).resolves.toEqual({
      status: "unavailable",
      detail: "The merge base could not be established.",
      evidence: { baseRevision, baselineRevision },
      nextAction: { command: "rerun-checkpoint", workUnit: plan.workUnitId },
    });
  });

  it.each([
    [1, "The delivery residual diff could not be read.", false],
    [2, "The delivery predecessor diff could not be read.", true],
  ] as const)(
    "retains the exact envelope when delivery diff read %s is unavailable",
    async (failureIndex, detail, residualEstablished) => {
      const plan = deliveryThreeMemberStackPlanFixture();
      const state = deliveryStateFixture(plan);
      const baselineRevision = state.members.at(-1)!.coordinates!.head;
      const baseRevision = oid("d");
      const mergeBase = oid("a");
      const sharedPath = "src/shared.ts";
      mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
      mocks.readCandidateRecordVersioned.mockResolvedValue({
        record: candidateRecord(plan.workUnitId, baselineRevision),
        version: `sha256:${"e".repeat(64)}`,
      });
      const exec = vi.fn(async (_command: string, args: readonly string[]) => {
        if (args[0] === "merge-base") return { stdout: `${mergeBase}\n`, stderr: "" };
        if (args[0] === "diff") return { stdout: `${sharedPath}\0`, stderr: "" };
        throw new Error(`unexpected git args: ${args.join(" ")}`);
      });
      let diffReads = 0;
      const rawExec = vi.fn(async () => {
        diffReads += 1;
        if (diffReads === failureIndex) throw new Error("private git diagnostic");
        return { stdout: new Uint8Array() };
      });
      const dependencies = createIntegrationCheckpointDependencies({ cwd: "/repository", exec, rawExec });

      await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
        mode: "authoritative",
        verdict: "reconcile",
        state: "diverged",
        ahead: 2,
        behind: 1,
        base: "main",
        baseOid: baseRevision,
        headOid: oid("c"),
        movement: "overlapping",
        integrationEvidence: {
          coverage: "complete",
          scannedCommitCount: 1,
          events: [],
          unclassifiedCommitCount: 0,
          truncated: false,
          limitations: [],
        },
        overlap: { status: "available", substantivePaths: [sharedPath], regenerablePaths: [] },
        register: null,
      })).resolves.toEqual({
        status: "unavailable",
        detail,
        evidence: {
          baselineRevision,
          baseRevision,
          mergeBase,
          substantivePaths: [sharedPath],
          regenerablePaths: [],
          ...(residualEstablished ? { residualPaths: [] } : {}),
        },
        nextAction: { command: "rerun-checkpoint", workUnit: plan.workUnitId },
      });
    },
  );

  it("refuses checkpoint persistence when the managed Candidate version moves", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const candidateId = `sha256:${"a".repeat(64)}`;
    const candidateHead = oid("c");
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: { candidateId },
      version: `sha256:${"1".repeat(64)}`,
    });
    mocks.readCandidateRecordVersion.mockResolvedValue(`sha256:${"2".repeat(64)}`);
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue({
      state: "current",
      candidateId,
      recognizedTarget: { revision: candidateHead, subject: { subjectDigest: `sha256:${"b".repeat(64)}` } },
    });
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue({
      status: "current",
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied",
    });
    const dependencies = createIntegrationCheckpointDependencies({ cwd: "/repository", exec: vi.fn() });
    await dependencies.readCandidate(plan.workUnitId, oid("d"));

    const result = await dependencies.createHandle({
      workUnit: plan.workUnitId,
      approvedHead: candidateHead,
      candidateTailDiff: {
        fromRevision: oid("a"),
        throughRevision: candidateHead,
        reference: `${oid("a")}..${candidateHead}`,
      },
      requirementSummary: { conclusion: "satisfied", requirements: [] },
      statusSummary: {
        lifecycle: {
          workUnit: plan.workUnitId,
          storageVersion: candidateHead,
          archiveCadence: "manual",
          state: "integrating",
          position: { phase: "Integrating", location: "active" },
          artifactFacts: [],
          complete: true,
        },
        changeRequest: {
          repository: "owner/repository",
          pullRequest: 43,
          baseRef: "main",
          headRef: "feat/example",
          headSha: candidateHead,
          state: "open",
        },
        requiredChecks: "green",
      },
      settlementPlan: composeCanonicalSettlementPlan([]),
      mergeMethod: {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repository",
        stackPosition: "non-delivery",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: `sha256:${"e".repeat(64)}`,
      },
    });

    expect(result).toEqual({
      status: "recompose-required",
      expectedRecordVersion: `sha256:${"1".repeat(64)}`,
      observedRecordVersion: `sha256:${"2".repeat(64)}`,
    });
    expect(mocks.persistIntegrationCheckpointComposition).not.toHaveBeenCalled();
    expect(mocks.readCandidateRecordVersioned).toHaveBeenCalledTimes(1);
    expect(mocks.readCandidateRecordVersion).toHaveBeenCalledTimes(1);
  });

  it("reads each exact member discharge for a multi-member delivery", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    for (const [index, member] of state.members.entries()) {
      member.changeRequest = { providerId: "github", changeRequestId: String(41 + index) };
    }
    const candidateId = `sha256:${"a".repeat(64)}`;
    const subjectDigest = `sha256:${"b".repeat(64)}`;
    const candidateHead = state.members.at(-1)!.coordinates!.head;
    const baseHead = oid("d");
    const reservation = createStandardReviewReservation({
      candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr"],
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "standard" }),
        retrigger: "full-final",
        count: 1,
      },
      target: {
        kind: "delivery",
        repository: "owner/repository",
        workUnitId: plan.workUnitId,
        planId: plan.planId,
      },
    });
    const currentness = {
      status: "current" as const,
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
    };
    const effective = {
      state: "current" as const,
      candidateId,
      recognizedTarget: { revision: candidateHead, subject: { subjectDigest } },
    };
    const targets = state.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      repository: "owner/repository",
      pullRequest: 41 + index,
      headSha: member.coordinates!.head,
      baseRevision: member.coordinates!.base,
    }));

    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: { candidateId },
      version: oid("1"),
    });
    mocks.collectGitCandidateTarget.mockResolvedValue({ subject: { subjectDigest } });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.resolveGitCandidateTargetBase.mockResolvedValue(baseHead);
    mocks.readSubmissionBoundary.mockResolvedValue({
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      deliveryReviewTermini: [],
    });
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    for (const [index, member] of state.members.entries()) {
      mocks.resolveChangeRequest.mockResolvedValueOnce({
        state: index === state.members.length - 1 ? "open" : "merged-at-head",
        targetRef: index === state.members.length - 1
          ? { repository: "owner/repository", pullRequest: 41 + index }
          : null,
        candidate: {
          number: 41 + index,
          headRefName: member.ref!.replace(/^refs\/heads\//u, ""),
          headRefOid: member.coordinates!.head,
          baseRefName: index === 0 ? "main" : state.members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
        },
      });
    }
    mocks.resolveDischargeTargets.mockResolvedValue({
      status: "resolved",
      targets: state.members.map((member, index) => ({
        planId: plan.planId,
        deliverableId: member.deliverableId,
        workUnitId: plan.workUnitId,
        ref: member.ref,
        providerId: member.changeRequest!.providerId,
        changeRequestId: member.changeRequest!.changeRequestId,
        base: member.coordinates!.base,
        head: member.coordinates!.head,
        position: index + 1,
        memberCount: state.members.length,
        chunkKey: plan.members[index]!.chunkKey,
        title: plan.members[index]!.title,
      })),
    });
    mocks.readRequest.mockImplementation(async (repository, binding) => {
      const index = Number(binding.changeRequestId) - 41;
      const member = state.members[index];
      if (member?.coordinates === null || member?.coordinates === undefined || member.ref === null) {
        return { status: "absent" };
      }
      return {
        status: "observed",
        request: {
          binding,
          repository,
          headRepository: repository,
          headRef: member.ref.replace(/^refs\/heads\//u, ""),
          headSha: member.coordinates.head,
          baseRef: index === 0 ? "main" : state.members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
          state: index === state.members.length - 1 ? "open" : "merged",
          draft: false,
        },
      };
    });
    mocks.resolveRepositoryIdentity.mockResolvedValue("repo-1");
    mocks.readOperationSnapshot.mockResolvedValue({ status: "complete", records: [] });
    mocks.readLaneProgress.mockImplementation(async (_store, input) => {
      const target = targets.find(({ headSha }) => headSha === input.headSha);
      if (target === undefined) return { status: "unrecorded" };
      const vehicle = {
        kind: "delivery-member" as const,
        planId: plan.planId,
        deliverableId: target.deliverableId,
        workUnitId: plan.workUnitId,
        head: target.headSha,
      };
      const reviewTarget = createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "delivery-member",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: target.baseRevision,
        diffBaseTree: oid("8"),
        headSha: target.headSha,
        headTree: oid("9"),
      });
      const requirement = createReviewRequirement({
        target: reviewTarget,
        projection: reservation.obligation,
        acceptableSources: [{ sourceKind: "hosted", qualifier: "coderabbit-pr" }],
        initialAdmission: "automatic",
      });
      if (requirement === null) throw new Error("checkpoint review requirement must derive");
      return {
        status: "recorded",
        completedPasses: 1,
        attempts: [{
          attemptId: `coderabbit-pr-${target.headSha}`,
          sourceId: "coderabbit-pr",
          outcome: "clean",
          hosted: {
            target: {
              repository: target.repository,
              pullRequest: target.pullRequest,
              headSha: target.headSha,
            },
            requestedCoverage: "complete",
            effectiveCoverage: "complete",
            vehicle,
            reviewTarget,
            requirement,
            actorIdentity: "reviewer-1",
            findings: [],
            dispositionSetId: null,
            settledFindingIds: [],
          },
        }],
      };
    });
    mocks.composeDeliveryCheckpointArm.mockImplementation((input) => ({
      status: "ready",
      review: input.review,
    }));
    const exec = vi.fn(async (_command: string, args: readonly string[]) => {
      if (args[0] === "merge-base") return { stdout: `${baseHead}\n`, stderr: "" };
      if (args[0] === "rev-list") return { stdout: `${args[1]!.split("..").at(-1)!}\n`, stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return { stdout: `${args[2]!.replace(/\^\{commit\}$/u, "")}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}")) {
        return { stdout: `${oid("f")}\n`, stderr: "" };
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

    const dependencies = createIntegrationCheckpointDependencies({ cwd: "/repository", exec });
    const result = await dependencies.composeDelivery({
      workUnit: plan.workUnitId,
      candidate: currentness,
      baseRevision: baseHead,
    });

    expect(result).toMatchObject({ status: "ready", review: { status: "discharged" } });
    expect(mocks.composeDeliveryCheckpointArm).toHaveBeenCalledWith(expect.objectContaining({
      review: {
        status: "discharged",
        targets: expect.arrayContaining(state.members.map((member) => expect.objectContaining({
          deliverableId: member.deliverableId,
        }))),
      },
    }));
  });

  it("offers terminal repair when the Candidate is ahead of its frozen closed request", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const terminal = state.members.at(-1)!;
    terminal.changeRequest = { providerId: "github", changeRequestId: "43" };
    const candidateId = `sha256:${"a".repeat(64)}`;
    const subjectDigest = `sha256:${"b".repeat(64)}`;
    const candidateHead = oid("f");
    const currentness = {
      status: "current" as const,
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
    };
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: { candidateId },
      version: oid("1"),
    });
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue({
      state: "current",
      candidateId,
      recognizedTarget: { revision: candidateHead, subject: { subjectDigest } },
    });
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.readSubmissionBoundary.mockResolvedValue({ candidateId, candidateSubjectDigest: subjectDigest });
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.resolveChangeRequest.mockResolvedValue({
      state: "closed-unmerged",
      targetRef: { repository: "owner/repository", headRef: terminal.ref, headSha: candidateHead },
      candidate: {
        number: 43,
        state: "CLOSED",
        url: "https://github.com/owner/repository/pull/43",
        headRefName: terminal.ref!.replace(/^refs\/heads\//u, ""),
        headRefOid: terminal.coordinates!.head,
        baseRefName: state.members.at(-2)!.ref!.replace(/^refs\/heads\//u, ""),
      },
    });

    const dependencies = createIntegrationCheckpointDependencies({ cwd: "/repository", exec: vi.fn() });
    await expect(dependencies.composeDelivery({
      workUnit: plan.workUnitId,
      candidate: currentness,
      baseRevision: oid("d"),
    })).resolves.toMatchObject({
      status: "blocked",
      nextAction: "reopen-and-retarget",
      reason: "top-target-mismatch",
      planId: plan.planId,
      remedy: {
        repository: "owner/repository",
        changeRequestId: "43",
        protectedBaseRef: "main",
      },
    });
  });
});
