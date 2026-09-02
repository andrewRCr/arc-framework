import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliveryThreeMemberStackPlanFixture } from "../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../fixtures/delivery-state.js";

const mocks = vi.hoisted(() => ({
  collectGitCandidateTarget: vi.fn(),
  composeDeliveryCheckpointArm: vi.fn(),
  createHostedReservationDischargeReader: vi.fn(),
  projectEffectiveCandidateCurrentness: vi.fn(),
  projectGitCandidateEffectiveTarget: vi.fn(),
  readCandidateRecord: vi.fn(),
  readCandidateRecordVersioned: vi.fn(),
  readConfigSettings: vi.fn(),
  readHostedReservationDischarge: vi.fn(),
  readSubmissionBoundary: vi.fn(),
  resolveChangeRequest: vi.fn(),
  resolveHostedReservationTargets: vi.fn(),
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
vi.mock("../../../../src/lib/work-unit/candidate-record-store.js", () => ({
  readCandidateRecord: mocks.readCandidateRecord,
  readCandidateRecordVersioned: mocks.readCandidateRecordVersioned,
}));
vi.mock("../../../../src/lib/work-unit/candidate-effective-target.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/candidate-effective-target.js")>(),
  projectEffectiveCandidateCurrentness: mocks.projectEffectiveCandidateCurrentness,
}));
vi.mock("../../../../src/lib/work-unit/git-candidate-effective-target.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../src/lib/work-unit/git-candidate-effective-target.js")>(),
  projectGitCandidateEffectiveTarget: mocks.projectGitCandidateEffectiveTarget,
}));
vi.mock("../../../../src/lib/work-unit/git-candidate-subject.js", () => ({
  collectGitCandidateTarget: mocks.collectGitCandidateTarget,
}));
vi.mock("../../../../src/lib/work-unit/submission-boundary-store.js", () => ({
  readSubmissionBoundary: mocks.readSubmissionBoundary,
}));
vi.mock("../../../../src/scripts/delivery/hosts/github.js", () => ({
  GhDeliveryHostPort: class {
    readonly mocked = true;
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
  },
}));
vi.mock("../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js", () => ({
  createHostedReservationDischargeReader: mocks.createHostedReservationDischargeReader,
  resolveHostedReservationTargets: mocks.resolveHostedReservationTargets,
}));
vi.mock("../../../../src/scripts/integration/delivery-checkpoint.js", () => ({
  composeDeliveryCheckpointArm: mocks.composeDeliveryCheckpointArm,
}));

import { createIntegrationCheckpointDependencies } from
  "../../../../src/scripts/integration/checkpoint-composition.js";

const oid = (character: string): string => character.repeat(40);

describe("delivery checkpoint composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    mocks.readCandidateRecord.mockResolvedValue({ candidateId });
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

  it("reads one aggregate review discharge for a multi-member delivery", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    for (const [index, member] of state.members.entries()) {
      member.changeRequest = { providerId: "github", changeRequestId: String(41 + index) };
    }
    const candidateId = `sha256:${"a".repeat(64)}`;
    const subjectDigest = `sha256:${"b".repeat(64)}`;
    const candidateHead = state.members.at(-1)!.coordinates!.head;
    const baseHead = oid("d");
    const reservation = { reservationId: `sha256:${"e".repeat(64)}` };
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

    mocks.readCandidateRecord.mockResolvedValue({ candidateId });
    mocks.readCandidateRecordVersioned.mockResolvedValue({
      record: { candidateId },
      version: oid("f"),
    });
    mocks.collectGitCandidateTarget.mockResolvedValue({ subject: { subjectDigest } });
    mocks.projectCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectEffectiveCandidateCurrentness.mockReturnValue(currentness);
    mocks.projectGitCandidateEffectiveTarget.mockResolvedValue(effective);
    mocks.readSubmissionBoundary.mockResolvedValue({
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
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
    mocks.resolveHostedReservationTargets.mockResolvedValue({
      status: "resolved",
      kind: "delivery",
      targets,
    });
    mocks.readHostedReservationDischarge.mockResolvedValue({ discharged: true, detail: "all members discharged" });
    mocks.createHostedReservationDischargeReader.mockReturnValue(mocks.readHostedReservationDischarge);
    mocks.composeDeliveryCheckpointArm.mockImplementation((input) => ({
      status: "ready",
      review: input.review,
    }));
    const exec = vi.fn(async (_command: string, args: readonly string[]) => {
      if (args[0] === "merge-base") return { stdout: `${baseHead}\n`, stderr: "" };
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
    expect(mocks.createHostedReservationDischargeReader).toHaveBeenCalledOnce();
    expect(mocks.readHostedReservationDischarge).toHaveBeenCalledOnce();
    expect(mocks.readHostedReservationDischarge).toHaveBeenCalledWith({
      workUnitId: plan.workUnitId,
      reservation,
      baseRevision: targets[0]!.baseRevision,
      approvedHead: targets[0]!.headSha,
      changeRequest: {
        repository: targets[0]!.repository,
        pullRequest: targets[0]!.pullRequest,
      },
    });
    expect(mocks.composeDeliveryCheckpointArm).toHaveBeenCalledWith(expect.objectContaining({
      review: {
        status: "discharged",
        targets: expect.arrayContaining(state.members.map((member) => expect.objectContaining({
          deliverableId: member.deliverableId,
        }))),
      },
    }));
  });
});
