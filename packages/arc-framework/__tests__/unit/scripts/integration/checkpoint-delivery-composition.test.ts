import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliveryThreeMemberStackPlanFixture } from "../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../fixtures/delivery-state.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
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
  resolveGitCandidateTargetBase: vi.fn(),
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
vi.mock("../../../../src/lib/work-unit/submission-boundary-store.js", () => ({
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

import {
  createIntegrationCheckpointDependencies,
  deliveryCheckpointReviewIsDischarged,
} from
  "../../../../src/scripts/integration/checkpoint-composition.js";

const oid = (character: string): string => character.repeat(40);

describe("delivery checkpoint composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("uses the injected raw executor for byte-preserving delivery drift reads", async () => {
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
      record: { candidateId },
      version: oid("e"),
    });
    mocks.collectGitCandidateTarget.mockResolvedValue({ subject: { subjectDigest } });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" } });
    mocks.resolveTerminalRecords.mockResolvedValue({ status: "resolved", plan, state });

    const dependencies = createIntegrationCheckpointDependencies({
      cwd: "/repository",
      exec: vi.fn(),
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

    expect(result.status).not.toBe("unavailable");
    expect(rawExec).toHaveBeenCalledTimes(2);
    for (const [args] of rawExec.mock.calls) {
      expect(args.slice(0, 4)).toEqual(["diff", "--name-only", "-z", "--no-renames"]);
    }
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
