import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliveryThreeMemberStackPlanFixture } from "../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../fixtures/delivery-state.js";
import { canonicalDigest, CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";
import { makeGitProcessError, scriptGitExec } from "../../../helpers/git-exec-fake.js";
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
import type { ReviewResult } from
  "../../../../src/scripts/review-gate/core/review-result.js";
import { createStandardReviewReservation } from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const mocks = vi.hoisted(() => ({
  collectGitCandidateSubject: vi.fn(),
  composeDeliveryCheckpointArm: vi.fn(),
  createHostedReservationDischargeReader: vi.fn(),
  projectEffectiveCandidateCurrentness: vi.fn(),
  projectGitCandidateEffectiveTarget: vi.fn(),
  persistIntegrationCheckpointComposition: vi.fn(),
  resolveIdentity: vi.fn(),
  createUserSurfaceResolver: vi.fn(),
  readGitCandidateTargetBase: vi.fn(),
  readCandidateRecordVersion: vi.fn(),
  readCandidateRecordVersioned: vi.fn(),
  readConfigSettings: vi.fn(),
  readLaneProgress: vi.fn(),
  readOperationSnapshot: vi.fn(),
  readResult: vi.fn(),
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
  collectGitCandidateSubject: mocks.collectGitCandidateSubject,
}));
vi.mock("../../../../src/lib/work-unit/git-candidate-effective-target.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/git-candidate-effective-target.js")>(),
  projectGitCandidateEffectiveTarget: mocks.projectGitCandidateEffectiveTarget,
  readGitCandidateTargetBase: mocks.readGitCandidateTargetBase,
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
vi.mock("../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js", () => ({
  createRepositoryReviewResultReader: vi.fn(() => ({ readResult: mocks.readResult })),
}));
vi.mock("../../../../src/scripts/review-gate/lane-progress.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/scripts/review-gate/lane-progress.js")>(),
  readLaneProgressAcrossLineage: mocks.readLaneProgress,
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

function mergeBaseAndDiff(mergeBase: string, paths: string) {
  return scriptGitExec([
    { match: { prefix: ["merge-base"] }, responses: [{ stdout: `${mergeBase}\n`, stderr: "" }] },
    { match: { prefix: ["diff"] }, responses: [{ stdout: paths, stderr: "" }] },
  ]);
}

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
      progress: [{
        status: "complete",
        completedPasses: 2,
        completePasses: 2,
        attempts: [],
        attemptHistory: [],
      }],
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
    const candidateId = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
    const subjectDigest = CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`);
    const candidateHead = oid("c");
    const currentness = {
      status: "current" as const,
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
      convergenceScope: null,
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
    mocks.collectGitCandidateSubject.mockResolvedValue({
      status: "collected",
      target: { subject: { subjectDigest } },
    });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });

    const mergeBase = oid("a");
    const { exec, calls } = mergeBaseAndDiff(mergeBase, "");
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
    expect(calls.some(({ args }) => args[0] === "merge-base")).toBe(true);
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
      convergenceScope: null,
    });
    const { exec, calls } = mergeBaseAndDiff(mergeBase, `${sharedPath}\0`);
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
    expect(calls.some(({ args }) => args[0] === "merge-base")).toBe(true);
  });

  it("scopes the residual to the operator's own resolution above the absorbed predecessor", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baselineRevision = state.members.at(-1)!.coordinates!.head;
    const baseRevision = oid("d");
    const mergeBase = oid("a");
    const highestCoordinate = state.members.at(-2)!.coordinates!;
    const firstCoordinate = state.members[0]!.coordinates!;
    const resolvedPath = "src/resolved.ts";
    const predecessorPath = "src/member.ts";
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
      convergenceScope: null,
    });
    const { exec, calls } = mergeBaseAndDiff(mergeBase, `${resolvedPath}\0`);
    // The absorbed top carries the predecessor's content as well as the hand resolution, so the
    // span each diff is anchored at decides which of the two the residual reports.
    const diffs = new Map([
      [`${highestCoordinate.head}..${baselineRevision}`, [resolvedPath]],
      [`${firstCoordinate.base}..${highestCoordinate.head}`, [predecessorPath]],
      [`${firstCoordinate.base}..${baselineRevision}`, [predecessorPath, resolvedPath]],
    ]);
    const rawExec = vi.fn(async (args: string[]) => {
      const paths = diffs.get(`${args[4]}..${args[5]}`);
      if (paths === undefined) throw new Error(`unexpected diff span: ${args.join(" ")}`);
      return { stdout: new TextEncoder().encode(paths.map((path) => `${path}\0`).join("")) };
    });
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
      overlap: { status: "available", substantivePaths: [resolvedPath], regenerablePaths: [] },
      register: null,
    })).resolves.toEqual({
      status: "reconcile",
      nextAction: "reconcile-base",
      safetyClass: "residual-contained",
      evidence: {
        baselineRevision,
        baseRevision,
        mergeBase,
        substantivePaths: [resolvedPath],
        regenerablePaths: [],
        residualPaths: [resolvedPath],
        predecessorPaths: [predecessorPath],
      },
    });
    expect(calls.some(({ args }) => args[0] === "merge-base")).toBe(true);
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

  it("routes a branch-and-base pair with two merge bases to reconciling the base", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec: vi.fn(async () => { throw new Error("no read is reached"); }),
    });

    // Merging the base in leaves one merge base where there were two, so the refusal names that and not a
    // rerun of the reading it would not change.
    await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: baseRevision,
      headOid: oid("c"),
      movement: "unknown",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "ambiguous" },
      register: null,
    })).resolves.toEqual({
      status: "unavailable",
      detail: "The branch and its base share more than one merge base, so the overlap cannot be proved from one.",
      evidence: { baseRevision },
      nextAction: { command: "reconcile-base", workUnit: plan.workUnitId },
    });
  });

  it("routes a pinned-baseline pair with two merge bases to retaking the baseline", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baselineRevision = state.members.at(-1)!.coordinates!.head;
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: candidateRecord(plan.workUnitId, baselineRevision),
      version: `sha256:${"e".repeat(64)}`,
    });
    const { exec, calls } = scriptGitExec([
      { match: { prefix: ["merge-base"] },
        responses: [{ stdout: `${oid("a")}\n${oid("b")}\n`, stderr: "" }] },
    ]);
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec,
    });

    // The baseline is pinned, so merging the base in moves neither side of this pair and the same two bases
    // survive it. Only a fresh baseline clears the refusal.
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
      detail: "The durable baseline and the observed base share more than one merge base, and merging the base "
        + "in moves neither of them.",
      evidence: { baseRevision, baselineRevision },
      nextAction: { command: "rebaseline", workUnit: plan.workUnitId },
    });
    expect(calls.map(({ args }) => args[0])).toEqual(["merge-base"]);
  });

  it("routes a branch and base sharing no history to the join no reconcile performs", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec: vi.fn(async () => { throw new Error("no read is reached"); }),
    });

    // A route exists — unlike the rerun, which reads the same absent ancestry again — but it is not the
    // append-only reconcile, which declines unrelated histories rather than joining them.
    await expect(dependencies.classifyDeliveryDrift(plan.workUnitId, {
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: baseRevision,
      headOid: oid("c"),
      movement: "unknown",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "unrelated" },
      register: null,
    })).resolves.toEqual({
      status: "unavailable",
      detail: "The branch and its base share no common ancestor, so nothing between them can be compared.",
      evidence: { baseRevision },
      nextAction: { command: "merge-unrelated", workUnit: plan.workUnitId },
    });
  });

  /** The one drift shape both guards above the base-resolution arms are reached with. */
  type PairOverlap =
    | { readonly status: "unrelated" }
    | { readonly status: "ambiguous" }
    | {
        readonly status: "available";
        readonly substantivePaths: string[];
        readonly regenerablePaths: string[];
      };

  const unresolvedPairDrift = (overlap: PairOverlap) => ({
    mode: "authoritative" as const,
    verdict: "reconcile" as const,
    state: "diverged" as const,
    ahead: 2,
    behind: 1,
    base: "main",
    baseOid: oid("d"),
    headOid: oid("c"),
    movement: "unknown" as const,
    integrationEvidence: {
      coverage: "complete" as const,
      scannedCommitCount: 1,
      events: [],
      unclassifiedCommitCount: 0,
      truncated: false,
      limitations: [],
    },
    overlap,
    register: null,
  });

  /**
   * The branch-and-base pair is not a delivery fact, and this classifier is not where a work unit without a
   * bound terminal should meet it: answering here wraps that pair in a delivery refusal whose own remedy is a
   * rerun of the checkpoint that raised it. The guard drops such a work unit first, and the movement plan
   * downstream reads the same pair and answers it directly.
   */
  describe("a work unit with no bound delivery terminal", () => {
    it.each([
      ["shares no history with", { status: "unrelated" } as const],
      ["shares more than one merge base with", { status: "ambiguous" } as const],
      ["resolves against", { status: "available" as const, substantivePaths: [], regenerablePaths: [] }],
    ])("declines a base that %s the branch, whatever the pair reads", async (_label, overlap) => {
      mocks.resolveTerminalRecords.mockResolvedValue({ status: "unbound" });
      const dependencies = createIntegrationCheckpointDependencies({
        cwd: "/repository",
        exec: vi.fn(async () => { throw new Error("no read is reached"); }),
      });

      await expect(dependencies.classifyDeliveryDrift("example", unresolvedPairDrift(overlap)))
        .resolves.toEqual({ status: "not-applicable" });
    });
  });

  it.each([
    ["shares no history with", { status: "unrelated" } as const],
    ["shares more than one merge base with", { status: "ambiguous" } as const],
  ])(
    "reports records it could not read before a base that %s the branch",
    async (_label, overlap) => {
      // The base reading is true either way, but it is not this classifier's answer until the records it
      // classifies against can be read. Reported ahead of them, it sends an operator to merge on evidence
      // that never established this classification applies to the work unit at all.
      mocks.resolveTerminalRecords.mockResolvedValue({ status: "unavailable" });
      const dependencies = createIntegrationCheckpointDependencies({
        cwd: "/repository",
        exec: vi.fn(async () => { throw new Error("no read is reached"); }),
      });

      await expect(dependencies.classifyDeliveryDrift("example", unresolvedPairDrift(overlap)))
        .resolves.toEqual({
          status: "unavailable",
          detail: "The delivery terminal records are unavailable.",
          evidence: { baseRevision: oid("d") },
          nextAction: { command: "rerun-checkpoint", workUnit: "example" },
        });
    },
  );

  it("routes a pinned-baseline pair sharing no history through the base before the baseline", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const baselineRevision = state.members.at(-1)!.coordinates!.head;
    const baseRevision = oid("d");
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: candidateRecord(plan.workUnitId, baselineRevision),
      version: `sha256:${"e".repeat(64)}`,
    });
    const { exec, calls } = scriptGitExec([
      { match: { prefix: ["merge-base"] }, responses: [{ failure: { exitCode: 1 } }] },
    ]);
    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec,
    });

    // Retaking the baseline is what clears an ambiguous pair here, and it cannot clear this one: a baseline
    // taken from a branch that shares no ancestry with the base shares none either. The base comes first.
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
      detail: "The durable baseline and the observed base share no common ancestor, so the base must be "
        + "joined to the branch before a fresh baseline can establish one.",
      evidence: { baseRevision, baselineRevision },
      nextAction: { command: "merge-unrelated", workUnit: plan.workUnitId },
    });
    expect(calls.map(({ args }) => args[0])).toEqual(["merge-base"]);
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
      exec: vi.fn(async (command, args) => {
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "missing object" });
      }),
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
      const { exec, calls } = mergeBaseAndDiff(mergeBase, `${sharedPath}\0`);
      let diffReads = 0;
      const rawExec = vi.fn(async (args) => {
        diffReads += 1;
        if (diffReads === failureIndex) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "private git diagnostic" });
        }
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
      expect(calls.some(({ args }) => args[0] === "merge-base")).toBe(true);
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
      convergenceScope: null,
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

  /**
   * A three-member delivery whose review is fully discharged, arranged to the point of composition.
   *
   * Reaching the terminal's predecessor-base read means getting past member discharge, so the
   * arrangement is the whole of it; two cases turn on what that read answers.
   */
  async function dischargedMultiMemberDelivery() {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    for (const [index, member] of state.members.entries()) {
      member.changeRequest = { providerId: "github", changeRequestId: String(41 + index) };
    }
    const candidateId = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
    const subjectDigest = CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`);
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
      convergenceScope: null,
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
    mocks.collectGitCandidateSubject.mockResolvedValue({
      status: "collected",
      target: { subject: { subjectDigest } },
    });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.readGitCandidateTargetBase.mockResolvedValue({ status: "resolved", base: baseHead });
    mocks.readSubmissionBoundary.mockResolvedValue({
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      deliveryReviewTermini: [],
    });
    mocks.readConfigSettings.mockResolvedValue({
      settings: { "branch.base": "main", "review.standard_max_passes": 2 },
    });
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
    const reviewResults = new Map<string, ReviewResult>();
    mocks.readResult.mockImplementation(async (producerId: string) => {
      const result = reviewResults.get(producerId);
      if (result === undefined) throw new Error(`missing review result: ${producerId}`);
      return result;
    });
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
      const producerId = `coderabbit-pr-${target.headSha}`;
      reviewResults.set(producerId, {
        kind: "hosted",
        producerId,
        repositoryId: reviewTarget.repositoryId,
        target: reviewTarget,
        sourceIdentity: "coderabbit-pr",
        originalOutcome: "clean",
        findings: [],
        resultDigest: canonicalDigest({ producerId }),
        admission: {
          lineage: {
            kind: "delivery-member",
            planId: vehicle.planId,
            deliverableId: vehicle.deliverableId,
            workUnitId: vehicle.workUnitId,
          },
          logicalPass: 1,
          retryGeneration: 0,
          requestedCoverage: "complete",
          effectiveCoverage: "complete",
          scopeMode: "whole-target",
          policyVersion: requirement.policyVersion,
        },
        laneOperationId: `lane-progress-${target.headSha}`,
        actorIdentity: "reviewer-1",
        hostedTarget: {
          repository: target.repository,
          pullRequest: target.pullRequest,
          headSha: target.headSha,
        },
        requirement,
        hostSettlementFindingIds: [],
        noHostSettlementFindingIds: [],
        settled: false,
      });
      return {
        status: "recorded",
        completedPasses: 1,
        completePasses: 1,
        attempts: [{
          attemptId: producerId,
          logicalPass: 1,
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
            dispositionSetLineage: [],
            settledFindingIds: [],
            settlementEvidence: [],
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
    return { plan, state, currentness, baseHead, dependencies };
  }

  it("reads each exact member discharge for a multi-member delivery", async () => {
    const { plan, state, currentness, baseHead, dependencies } = await dischargedMultiMemberDelivery();
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

  it("refuses to compose a terminal whose predecessor base is not one coordinate", async () => {
    const { plan, currentness, baseHead, dependencies } = await dischargedMultiMemberDelivery();
    mocks.readGitCandidateTargetBase.mockResolvedValue({
      status: "refused",
      reason: "merge-base-ambiguous",
      detail: "The Candidate target has more than one base coordinate.",
    });

    // Stated in this reader's own words rather than forwarded from the base reader's: what cannot be
    // composed here is the terminal's coordinate set, which a pair carrying two ancestors does not fix.
    await expect(dependencies.composeDelivery({
      workUnit: plan.workUnitId,
      candidate: currentness,
      baseRevision: baseHead,
    })).rejects.toThrow("The delivery terminal's predecessor base is not a single coordinate.");
  });

  it("offers terminal repair when the Candidate is ahead of its frozen closed request", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const terminal = state.members.at(-1)!;
    terminal.changeRequest = { providerId: "github", changeRequestId: "43" };
    const candidateId = CanonicalDigestSchema.parse(`sha256:${"a".repeat(64)}`);
    const subjectDigest = CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`);
    const candidateHead = oid("f");
    const currentness = {
      status: "current" as const,
      candidateId,
      recognizedRevision: candidateHead,
      implementationChanged: false,
      convergenceVerification: "satisfied" as const,
      convergenceScope: null,
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
    await expect(dependencies.readDeliveryTerminalRemedy({
      workUnit: plan.workUnitId,
      candidate: currentness,
      baseRevision: oid("d"),
    })).resolves.toMatchObject({
      status: "blocked",
      nextAction: "reopen-and-retarget",
      reason: "top-target-mismatch",
      planId: plan.planId,
    });
    expect(mocks.resolveDischargeTargets).not.toHaveBeenCalled();
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
